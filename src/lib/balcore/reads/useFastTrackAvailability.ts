/**
 * Can this pool serve an instant (fast-track) exit right now?
 *
 * `BalCoreBank.fastTrackWithdraw` fails closed behind three gates, checked in
 * this order (BalCoreBank.sol:1095-1185):
 *
 *   1. `runMode` — fast-track is suspended entirely while the bank is running
 *      its queue (§4.2 dial 6, `FastTrackSuspendedDuringRun`).
 *   2. A daily volume cap of 5% of holder-TVL (`FAST_TRACK_DAILY_CAP_BPS` 500,
 *      BalCoreBank.sol:52), where the day rolls when
 *      `block.timestamp >= fastTrackDayStart + 1 days`.
 *   3. A liquidity gate: `sourceableValueNow()` must cover the net payout PLUS
 *      every outstanding residual (`FastTrackPoolInsufficient`).
 *
 * This hook reports the pool-level headroom — enough to disable the option and
 * say why before the user types an amount. The per-amount check (does THIS
 * withdrawal fit) needs the amount, so it is exposed as `fitsAmount`.
 */

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { defaultChain } from "@/lib/wagmi";
import { balcoreBankAbi } from "../abi/bank";
import { balcoreVaultAbi } from "../abi/vault";
import {
  BALCORE_CHAIN_ID,
  BALCORE_DEPLOYED,
  poolByKey,
  type BalcorePool,
  type PoolKey,
} from "../config/addresses";
import { holderTVL } from "../math";
import { bigintAt, boolAt, toFloat } from "./shared";

/** BalCoreBank.sol:52 — `FAST_TRACK_DAILY_CAP_BPS`. */
export const FAST_TRACK_DAILY_CAP_BPS = 500n;
/** `VaultMath.calculateFastTrackFee` — a flat 3% (VaultMath.sol:298). */
export const FAST_TRACK_FEE_BPS = 300n;
/** The day window `_updateFastTrackDay` rolls on. */
const ONE_DAY_SECONDS = 86_400n;

export interface FastTrackAvailability {
  pool: BalcorePool;
  /** Pool-level: an instant exit is possible for some non-zero amount. */
  available: boolean;
  /** User-facing reason when `available` is false; null when it is true. */
  reason: string | null;

  /**
   * Largest gross withdrawal value the pool could still serve today, in
   * tokenB atoms — the tighter of the remaining daily cap and what the
   * liquidity gate can source.
   */
  remainingCapUsdc: bigint;
  remainingCapUsd: number;

  /** Remaining room under the 5%/day cap alone, tokenB atoms. */
  dailyCapRemaining: bigint;
  /** What the vault can actually hand over now, net of reserved residuals. */
  sourceableNet: bigint;

  /** Unix seconds at which the daily window rolls and the cap resets. */
  dayResetsAt: bigint;
  runMode: boolean;
  paused: boolean;

  /**
   * Would a withdrawal of `grossValue` (tokenB atoms) pass both gates?
   * Applies the 3% fee to get the net payout the liquidity gate compares.
   */
  fitsAmount: (grossValue: bigint) => boolean;
}

export interface UseFastTrackAvailabilityResult {
  data: FastTrackAvailability | null;
  isLoading: boolean;
  isError: boolean;
  pool: BalcorePool | undefined;
  refetch: () => void;
}

const I = {
  runMode: 0,
  paused: 1,
  fastTrackDayStart: 2,
  fastTrackDayVolume: 3,
  sourceableValueNow: 4,
  totalResidualValue: 5,
  totalAssets: 6,
  pendingBtcb: 7,
  pendingUsdc: 8,
  lastValidPrice: 9,
} as const;

const CALL_COUNT = Object.keys(I).length;

function buildCalls(pool: BalcorePool) {
  const bank = { abi: balcoreBankAbi, address: pool.bank, chainId: defaultChain.id } as const;

  return [
    { ...bank, functionName: "runMode" },
    { ...bank, functionName: "paused" },
    { ...bank, functionName: "fastTrackDayStart" },
    { ...bank, functionName: "fastTrackDayVolume" },
    { ...bank, functionName: "sourceableValueNow" },
    { ...bank, functionName: "totalResidualValue" },
    { ...bank, functionName: "totalAssets" },
    { ...bank, functionName: "pendingBtcb" },
    { ...bank, functionName: "pendingUsdc" },
    {
      abi: balcoreVaultAbi,
      address: pool.vault,
      chainId: defaultChain.id,
      functionName: "lastValidPrice",
    },
  ];
}

export function useFastTrackAvailability(key: PoolKey): UseFastTrackAvailabilityResult {
  const pool = poolByKey(key);
  const enabled = Boolean(pool) && BALCORE_DEPLOYED && defaultChain.id === BALCORE_CHAIN_ID;

  const contracts = useMemo(() => (pool ? buildCalls(pool) : []), [pool]);

  const reads = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled },
  });

  const data = useMemo<FastTrackAvailability | null>(() => {
    if (!pool || !enabled) return null;
    const r = reads.data as
      readonly { status: "success" | "failure"; result?: unknown }[] | undefined;
    if (!r || r.length < CALL_COUNT) return null;

    const runMode = boolAt(r, I.runMode) ?? false;
    const paused = boolAt(r, I.paused) ?? false;

    const dayStart = bigintAt(r, I.fastTrackDayStart) ?? 0n;
    const dayVolume = bigintAt(r, I.fastTrackDayVolume) ?? 0n;
    const sourceable = bigintAt(r, I.sourceableValueNow) ?? 0n;
    const residuals = bigintAt(r, I.totalResidualValue) ?? 0n;

    const totalAssets = bigintAt(r, I.totalAssets) ?? 0n;
    const price = bigintAt(r, I.lastValidPrice) ?? 0n;
    const holder = holderTVL(
      totalAssets,
      bigintAt(r, I.pendingBtcb) ?? 0n,
      bigintAt(r, I.pendingUsdc) ?? 0n,
      price,
      pool.scaleA2B,
    );

    // The cap is taken against holder-TVL, the same base fastTrackWithdraw uses.
    const dailyCap = (holder * FAST_TRACK_DAILY_CAP_BPS) / 10_000n;

    // `_updateFastTrackDay` zeroes the volume once the window has rolled, so a
    // stale day means the full cap is available even though dayVolume is high.
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const dayRolled = dayStart === 0n || nowSec >= dayStart + ONE_DAY_SECONDS;
    const usedToday = dayRolled ? 0n : dayVolume;
    const dailyCapRemaining = dailyCap > usedToday ? dailyCap - usedToday : 0n;

    // Liquidity gate compares the NET payout against sourceable minus the
    // residuals already reserved for earlier exiters.
    const sourceableNet = sourceable > residuals ? sourceable - residuals : 0n;
    // Net = gross * 97%, so the gross a given net supports is net / 0.97.
    const grossFromNet = (sourceableNet * 10_000n) / (10_000n - FAST_TRACK_FEE_BPS);

    const remainingCapUsdc = dailyCapRemaining < grossFromNet ? dailyCapRemaining : grossFromNet;

    let reason: string | null = null;
    if (pool.status !== "live") reason = `${pool.label} is not open yet.`;
    else if (paused) reason = "Withdrawals are paused right now.";
    else if (runMode) reason = "Fast-Track is suspended while the pool works through its queue.";
    // An empty vault has a 0 cap for want of TVL, not because the day's
    // allowance was spent — saying "hit its limit" there would be a lie.
    else if (holder <= 0n) reason = "This pool has no liquidity yet.";
    else if (dailyCapRemaining <= 0n) reason = "Fast-Track has hit its limit for today.";
    else if (sourceableNet <= 0n) reason = "Not enough liquidity on hand for an instant exit.";

    const available = reason === null && remainingCapUsdc > 0n;

    return {
      pool,
      available,
      reason,
      remainingCapUsdc,
      remainingCapUsd: toFloat(remainingCapUsdc, pool.tokenB.decimals),
      dailyCapRemaining,
      sourceableNet,
      dayResetsAt: dayStart === 0n ? 0n : dayStart + ONE_DAY_SECONDS,
      runMode,
      paused,
      fitsAmount: (grossValue: bigint) => {
        if (!available || grossValue <= 0n) return false;
        if (grossValue > dailyCapRemaining) return false;
        const net = grossValue - (grossValue * FAST_TRACK_FEE_BPS) / 10_000n;
        return net <= sourceableNet;
      },
    };
  }, [pool, enabled, reads.data]);

  return {
    data,
    isLoading: enabled && reads.isLoading,
    isError: reads.isError,
    pool,
    refetch: reads.refetch,
  };
}
