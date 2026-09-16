/**
 * Live protocol state for one Balcore pool.
 *
 * Follows the read pattern established by
 * `src/features/ui-preview/dashboard/data/swapBalances.ts`: one batched
 * `useReadContracts` with `allowFailure`, an explicit `chainId`, an `enabled`
 * gate, and a result carrying BOTH the raw bigints (for anything that decides
 * an amount) and display floats (for the screen).
 *
 * Everything here is a view call — nothing in this file can move funds.
 */

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { defaultChain } from "@/lib/wagmi";
import { balcoreBankAbi } from "../abi/bank";
import { chainlinkFeedAbi } from "../abi/feed";
import { balcoreVaultAbi } from "../abi/vault";
import { balcoreSequencerAbi } from "../abi/sequencer";
import { lbPairAbi } from "../abi/pair";
import {
  BALCORE_CHAIN_ID,
  BALCORE_DEPLOYED,
  poolByKey,
  type BalcorePool,
  type PoolKey,
} from "../config/addresses";
import {
  binToPrice,
  feeDialLane,
  holderTVL,
  matchedAmount,
  nextTuesday00Z,
  type FeeDialKey,
} from "../math";
import { bigintAt, boolAt, feedAnswerAt, numberAt, priceToFloat, toFloat } from "./shared";

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export interface VaultRange {
  /** Keeper-chosen LB bin bounds. 0 when no position is deployed. */
  lowerBin: number;
  upperBin: number;
  /** Those bins as human prices (tokenB per tokenA). */
  lowerPrice: number;
  upperPrice: number;
}

export interface TokenPair<T> {
  tokenA: T;
  tokenB: T;
}

export interface VaultStats {
  pool: BalcorePool;

  /** `bank.totalAssets()` — pricing-TVL, tokenB atoms. */
  totalAssets: bigint;
  totalAssetsUsd: number;
  /** Pricing-TVL minus earmarked pending baskets — what backs LIVE shares. */
  holderTVL: bigint;
  holderTVLUsd: number;
  totalShares: bigint;

  /** `LAUNCH_TVL_CAP`, and null when the cap has been lifted. */
  tvlCap: bigint | null;
  tvlCapActive: boolean;
  /** Room left under the cap, floored at 0. null when uncapped. */
  capRemaining: bigint | null;
  capRemainingUsd: number | null;

  currentEpoch: bigint;
  /** Unix seconds of the last weekly distribution. */
  lastDistributionTimestamp: bigint;
  /** Next Tuesday 00:00 UTC boundary, ms since epoch. */
  nextSettlement: number;

  range: VaultRange;
  /** Live bin from the LB pair, or null if the pair read failed. */
  activeBin: number | null;
  /** Whether the live bin sits inside the deployed range. */
  inRange: boolean;

  /**
   * `vault.lastValidPrice()` — tokenA/USD, 8 decimals.
   *
   * THE ANCHOR, NOT THE PRICE, and never safe to put on screen. It is whatever
   * the last state-changing call wrote, and the dry-run harness measured it
   * 1.330% away from the live feed on 2026-09-13 ($78,167.36 anchor vs
   * $77,138.59 feed). Kept because the bank's own views value against it, so
   * it is what reconciles with on-chain accounting — use `feedPrice8` for
   * anything a user sees.
   */
  price: bigint;
  priceUsd: number;

  /**
   * The LIVE Chainlink answer for tokenA/USD, 8 decimals — `latestRoundData()`
   * at `pool.feed`, the same read `fetchAndCheckPrice()` performs.
   *
   * 0n when the feed call failed or reported a non-positive answer. Callers
   * must render a placeholder on 0n rather than a zero price.
   */
  feedPrice8: bigint;
  feedPriceUsd: number;

  /**
   * Holder-TVL recomputed at the LIVE feed price instead of the anchor.
   *
   * Differs from `holderTVL` only by the tokenA leg of the earmarked pending
   * baskets, which the two prices value differently. This is the figure to
   * display; `holderTVL` is the figure that matches the bank's books.
   * Falls back to the anchored value when the feed is unreadable.
   */
  holderTVLAtFeed: bigint;
  holderTVLAtFeedUsd: number;

  reserves: TokenPair<bigint>;
  reservesDisplay: TokenPair<number>;
  debts: TokenPair<bigint>;
  debtsDisplay: TokenPair<number>;

  /** Harvested fees not yet distributed, tokenB atoms. */
  pendingHarvest: bigint;
  pendingHarvestUsd: number;
  /** The reserve/IL-shield vault balance, tokenB atoms. */
  reserveVault: bigint;
  reserveVaultUsd: number;

  /** Bank is in run mode — fast-track is suspended while true. */
  runMode: boolean;
  paused: boolean;

  /** APY cap in bps from the packed fee dials. 3000 = the advertised 30%. */
  apyCapBps: number;

  /**
   * EVERY dial out of `feeDialsPacked()`, in bps — the protocol's live fee
   * configuration rather than the numbers a designer typed into the Protocol
   * screen. `apyCapBps` above is the same value as `feeDialsBps.apyCap`, kept
   * because callers already use it.
   *
   * Launch values (math.ts:79-92): base 500, debtRepay 2500, perf 3000,
   * apyCap 3000, reserveHealth 500, ilSkim 0.
   */
  feeDialsBps: Record<FeeDialKey, number>;

  /**
   * Both legs are above the sequencer's `minPositionValueB` floor, i.e. the
   * vault can still be repositioned. Mirrors `BalCoreVault.isTokenDepleted`
   * (BalCoreVault.sol:705-736), which values the tokenA leg at the feed price
   * and compares each leg with a strict `<`.
   */
  vaultOpen: boolean;
  minPositionValueB: bigint;
}

export interface UseVaultStatsResult {
  data: VaultStats | null;
  isLoading: boolean;
  isError: boolean;
  /** Null off mainnet or for an unknown key — nothing was queried. */
  pool: BalcorePool | undefined;
  refetch: () => void;
}

/* ------------------------------------------------------------------ */
/* Call layout                                                         */
/* ------------------------------------------------------------------ */

/**
 * Positional indices into the batch.
 *
 * Named rather than inlined so adding a read cannot silently shift what an
 * existing field decodes — the failure mode of a positional multicall.
 */
const I = {
  totalAssets: 0,
  totalShares: 1,
  currentEpoch: 2,
  launchTvlCap: 3,
  tvlCapActive: 4,
  runMode: 5,
  paused: 6,
  pendingBtcb: 7,
  pendingUsdc: 8,
  lastValidPrice: 9,
  rangeLower: 10,
  rangeUpper: 11,
  lastDistribution: 12,
  btcbReserve: 13,
  usdcReserve: 14,
  btcbDebt: 15,
  usdcDebt: 16,
  pendingHarvest: 17,
  reserveVault: 18,
  feeDials: 19,
  minPositionValueB: 20,
  activeId: 21,
  feedRound: 22,
} as const;

const CALL_COUNT = Object.keys(I).length;

function buildCalls(pool: BalcorePool) {
  const bank = { abi: balcoreBankAbi, address: pool.bank, chainId: defaultChain.id } as const;
  const vault = { abi: balcoreVaultAbi, address: pool.vault, chainId: defaultChain.id } as const;

  // Order MUST match `I` above.
  return [
    { ...bank, functionName: "totalAssets" },
    { ...bank, functionName: "totalShares" },
    { ...bank, functionName: "currentEpoch" },
    { ...bank, functionName: "LAUNCH_TVL_CAP" },
    { ...bank, functionName: "tvlCapActive" },
    { ...bank, functionName: "runMode" },
    { ...bank, functionName: "paused" },
    { ...bank, functionName: "pendingBtcb" },
    { ...bank, functionName: "pendingUsdc" },
    { ...vault, functionName: "lastValidPrice" },
    { ...vault, functionName: "rangeLower" },
    { ...vault, functionName: "rangeUpper" },
    { ...vault, functionName: "lastDistributionTimestamp" },
    { ...vault, functionName: "btcbReserve" },
    { ...vault, functionName: "usdcReserve" },
    { ...vault, functionName: "btcbDebt" },
    { ...vault, functionName: "usdcDebt" },
    { ...vault, functionName: "pendingHarvestUsdc" },
    { ...vault, functionName: "reserveVaultBalance" },
    { ...vault, functionName: "feeDialsPacked" },
    {
      abi: balcoreSequencerAbi,
      address: pool.sequencer,
      chainId: defaultChain.id,
      functionName: "minPositionValueB",
    },
    {
      abi: lbPairAbi,
      address: pool.pair,
      chainId: defaultChain.id,
      functionName: "getActiveId",
    },
    // THE PRICE ANYTHING USER-FACING IS ALLOWED TO USE. See `feedPrice8`.
    {
      abi: chainlinkFeedAbi,
      address: pool.feed,
      chainId: defaultChain.id,
      functionName: "latestRoundData",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useVaultStats(key: PoolKey): UseVaultStatsResult {
  const pool = poolByKey(key);

  // Not gated on a connected wallet: the vault's own state is public, and the
  // overview should read for a visitor who has not connected yet.
  // The BALCORE_DEPLOYED gate guarantees defaultChain.id === BALCORE_CHAIN_ID
  // here; off mainnet there is no deployment and nothing is queried at all.
  const enabled = Boolean(pool) && BALCORE_DEPLOYED && defaultChain.id === BALCORE_CHAIN_ID;

  const contracts = useMemo(() => (pool ? buildCalls(pool) : []), [pool]);

  const reads = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled },
  });

  const data = useMemo<VaultStats | null>(() => {
    if (!pool || !enabled) return null;
    const r = reads.data as
      readonly { status: "success" | "failure"; result?: unknown }[] | undefined;
    if (!r || r.length < CALL_COUNT) return null;

    const totalAssets = bigintAt(r, I.totalAssets) ?? 0n;
    const totalShares = bigintAt(r, I.totalShares) ?? 0n;
    const price = bigintAt(r, I.lastValidPrice) ?? 0n;
    const pendingA = bigintAt(r, I.pendingBtcb) ?? 0n;
    const pendingB = bigintAt(r, I.pendingUsdc) ?? 0n;

    const holder = holderTVL(totalAssets, pendingA, pendingB, price, pool.scaleA2B);

    // The live feed, and holder-TVL re-struck against it. Only the pending
    // tokenA earmark is priced, so the two agree whenever nothing is queued.
    const feedPrice8 = feedAnswerAt(r, I.feedRound);
    const holderAtFeed =
      feedPrice8 > 0n
        ? holderTVL(totalAssets, pendingA, pendingB, feedPrice8, pool.scaleA2B)
        : holder;

    const capActive = boolAt(r, I.tvlCapActive) ?? false;
    const rawCap = bigintAt(r, I.launchTvlCap);
    const tvlCap = capActive ? rawCap : null;
    const capRemaining = tvlCap === null ? null : tvlCap > totalAssets ? tvlCap - totalAssets : 0n;

    const lowerBin = numberAt(r, I.rangeLower) ?? 0;
    const upperBin = numberAt(r, I.rangeUpper) ?? 0;
    const activeBin = numberAt(r, I.activeId);
    const deployed = lowerBin > 0 && upperBin > 0;

    const reserves: TokenPair<bigint> = {
      tokenA: bigintAt(r, I.btcbReserve) ?? 0n,
      tokenB: bigintAt(r, I.usdcReserve) ?? 0n,
    };
    const debts: TokenPair<bigint> = {
      tokenA: bigintAt(r, I.btcbDebt) ?? 0n,
      tokenB: bigintAt(r, I.usdcDebt) ?? 0n,
    };

    const minPositionValueB = bigintAt(r, I.minPositionValueB) ?? 0n;
    // isTokenDepleted: a leg is depleted at 0, or below the floor once valued
    // in tokenB terms. Open = neither leg depleted.
    const reserveAValue = matchedAmount({ tokenA: reserves.tokenA }, price, pool.scaleA2B);
    const vaultOpen =
      reserves.tokenA > 0n &&
      reserves.tokenB > 0n &&
      reserveAValue >= minPositionValueB &&
      reserves.tokenB >= minPositionValueB;

    const feeDials = bigintAt(r, I.feeDials) ?? 0n;
    const pendingHarvestAtoms = bigintAt(r, I.pendingHarvest) ?? 0n;
    const reserveVaultAtoms = bigintAt(r, I.reserveVault) ?? 0n;

    return {
      pool,
      totalAssets,
      totalAssetsUsd: toFloat(totalAssets, pool.tokenB.decimals),
      holderTVL: holder,
      holderTVLUsd: toFloat(holder, pool.tokenB.decimals),
      totalShares,
      tvlCap,
      tvlCapActive: capActive,
      capRemaining,
      capRemainingUsd: capRemaining === null ? null : toFloat(capRemaining, pool.tokenB.decimals),
      currentEpoch: bigintAt(r, I.currentEpoch) ?? 0n,
      lastDistributionTimestamp: bigintAt(r, I.lastDistribution) ?? 0n,
      nextSettlement: nextTuesday00Z(),
      range: {
        lowerBin,
        upperBin,
        lowerPrice: deployed
          ? binToPrice(lowerBin, pool.binStep, pool.tokenA.decimals, pool.tokenB.decimals)
          : 0,
        upperPrice: deployed
          ? binToPrice(upperBin, pool.binStep, pool.tokenA.decimals, pool.tokenB.decimals)
          : 0,
      },
      activeBin,
      inRange: deployed && activeBin !== null && activeBin >= lowerBin && activeBin <= upperBin,
      price,
      priceUsd: priceToFloat(price),
      feedPrice8,
      feedPriceUsd: priceToFloat(feedPrice8),
      holderTVLAtFeed: holderAtFeed,
      holderTVLAtFeedUsd: toFloat(holderAtFeed, pool.tokenB.decimals),
      reserves,
      reservesDisplay: {
        tokenA: toFloat(reserves.tokenA, pool.tokenA.decimals),
        tokenB: toFloat(reserves.tokenB, pool.tokenB.decimals),
      },
      debts,
      debtsDisplay: {
        tokenA: toFloat(debts.tokenA, pool.tokenA.decimals),
        tokenB: toFloat(debts.tokenB, pool.tokenB.decimals),
      },
      pendingHarvest: pendingHarvestAtoms,
      pendingHarvestUsd: toFloat(pendingHarvestAtoms, pool.tokenB.decimals),
      reserveVault: reserveVaultAtoms,
      reserveVaultUsd: toFloat(reserveVaultAtoms, pool.tokenB.decimals),
      runMode: boolAt(r, I.runMode) ?? false,
      paused: boolAt(r, I.paused) ?? false,
      apyCapBps: feeDialLane(feeDials, "apyCap"),
      // Listed one by one rather than mapped, so a new lane in FEE_DIAL_KEYS is
      // a type error here instead of a silently missing field.
      feeDialsBps: {
        base: feeDialLane(feeDials, "base"),
        debtRepay: feeDialLane(feeDials, "debtRepay"),
        perf: feeDialLane(feeDials, "perf"),
        apyCap: feeDialLane(feeDials, "apyCap"),
        reserveHealth: feeDialLane(feeDials, "reserveHealth"),
        ilSkim: feeDialLane(feeDials, "ilSkim"),
      },
      vaultOpen,
      minPositionValueB,
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
