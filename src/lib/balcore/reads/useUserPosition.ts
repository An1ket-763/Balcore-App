/**
 * One holder's position in one Balcore pool.
 *
 * Two batches, because the second depends on the first: the previous epoch's
 * yield-per-share can only be fetched once `currentEpoch` is known. The second
 * batch stays disabled until then rather than guessing an index.
 *
 * Same conventions as `useVaultStats` and swapBalances.ts — `allowFailure`,
 * explicit `chainId`, `enabled` gates, raw bigints beside display floats.
 */

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
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
import { holderTVL, positionValue } from "../math";
import { bigintAt, boolAt, toFloat, tupleAt, tupleBigint, tupleBool } from "./shared";

/** `PRECISION` on the bank — yieldPerShare is scaled by 1e18. */
const PRECISION = 10n ** 18n;

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export interface WithdrawRequestView {
  /** True when a request exists at all. */
  exists: boolean;
  shares: bigint;
  /** Deposit value struck at request time, tokenB atoms. */
  depositVal: bigint;
  /** Unix seconds the request becomes executable. */
  readyAt: bigint;
  executed: boolean;
  /** Convenience: readyAt has passed and the request is unexecuted. */
  ready: boolean;
}

/** `withdrawBasket` — the tokens earmarked for a queued exit. */
export interface WithdrawBasketView {
  tokenA: bigint;
  tokenB: bigint;
  strikeValue: bigint;
  residualValue: bigint;
  tokenADisplay: number;
  tokenBDisplay: number;
  strikeValueUsd: number;
}

/** `previewWithdraw` — how much of the claim can be paid right now. */
export interface WithdrawPreview {
  payableNow: bigint;
  residual: bigint;
  payableNowUsd: number;
  residualUsd: number;
}

export interface UserPosition {
  pool: BalcorePool;
  address: Address;

  shares: bigint;
  /** Share of the pool, 0..100. 0 when the vault has no shares. */
  sharePct: number;
  /** Shares valued against holder-TVL, tokenB atoms. */
  positionValue: bigint;
  positionValueUsd: number;

  /** Deposit has rolled into an active epoch and is earning LP fees. */
  activated: boolean;
  entryEpoch: bigint;
  lastClaimedEpoch: bigint;
  /** Deposited but not yet rolled — sitting in the queue. */
  queued: { tokenA: bigint; tokenB: bigint };

  /** `depositValue` — the strike the position is protected at, tokenB atoms. */
  depositValue: bigint;
  depositValueUsd: number;

  claimable: { tokenA: bigint; tokenB: bigint; tokenBUsd: number };
  withdrawRequest: WithdrawRequestView;
  basket: WithdrawBasketView;
  preview: WithdrawPreview;

  /**
   * Yield credited for the epoch that just settled, tokenB atoms.
   *
   * `epochs(currentEpoch - 1).usdcYieldPerShare * shares / 1e18`, and only
   * when that epoch is settled and the holder entered before it — the same two
   * skips `VaultViewLib.claimableYield` applies (VaultViewLib.sol:~60-70).
   * null while the previous epoch is unknown, unsettled, or predates entry.
   */
  lastWeekYield: bigint | null;
  lastWeekYieldUsd: number | null;
}

export interface UseUserPositionResult {
  data: UserPosition | null;
  isLoading: boolean;
  isError: boolean;
  pool: BalcorePool | undefined;
  refetch: () => void;
}

/* ------------------------------------------------------------------ */
/* Call layout                                                         */
/* ------------------------------------------------------------------ */

const I = {
  positions: 0,
  claimable: 1,
  withdrawRequest: 2,
  basket: 3,
  preview: 4,
  depositValue: 5,
  isActivated: 6,
  totalShares: 7,
  totalAssets: 8,
  pendingBtcb: 9,
  pendingUsdc: 10,
  currentEpoch: 11,
  lastValidPrice: 12,
} as const;

const CALL_COUNT = Object.keys(I).length;

/** Field offsets in the `positions` mapping getter tuple. */
const POS = {
  shares: 0,
  entryEpoch: 1,
  lastClaimedEpoch: 2,
  queuedBtcb: 3,
  queuedUsdc: 4,
  activated: 5,
  depositTimestamp: 6,
} as const;

/** Field offsets in the `epochs` mapping getter tuple. */
const EPOCH = {
  btcbYieldPerShare: 0,
  usdcYieldPerShare: 1,
  startTimestamp: 2,
  endTimestamp: 3,
  settled: 4,
  activeShares: 5,
} as const;

function buildCalls(pool: BalcorePool, user: Address) {
  const bank = { abi: balcoreBankAbi, address: pool.bank, chainId: defaultChain.id } as const;
  const vault = { abi: balcoreVaultAbi, address: pool.vault, chainId: defaultChain.id } as const;
  const forUser = [user] as const;

  // Order MUST match `I` above.
  return [
    { ...bank, functionName: "positions", args: forUser },
    { ...bank, functionName: "getClaimableYield", args: forUser },
    { ...bank, functionName: "withdrawRequests", args: forUser },
    { ...bank, functionName: "withdrawBasket", args: forUser },
    { ...bank, functionName: "previewWithdraw", args: forUser },
    { ...bank, functionName: "depositValue", args: forUser },
    { ...bank, functionName: "isActivated", args: forUser },
    { ...bank, functionName: "totalShares" },
    { ...bank, functionName: "totalAssets" },
    { ...bank, functionName: "pendingBtcb" },
    { ...bank, functionName: "pendingUsdc" },
    { ...bank, functionName: "currentEpoch" },
    { ...vault, functionName: "lastValidPrice" },
  ];
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useUserPosition(key: PoolKey, address: Address | undefined): UseUserPositionResult {
  const pool = poolByKey(key);

  const enabled =
    Boolean(pool) && Boolean(address) && BALCORE_DEPLOYED && defaultChain.id === BALCORE_CHAIN_ID;

  const contracts = useMemo(
    () => (pool && address ? buildCalls(pool, address) : []),
    [pool, address],
  );

  const reads = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled },
  });

  const results = reads.data as
    readonly { status: "success" | "failure"; result?: unknown }[] | undefined;

  const currentEpoch = bigintAt(results, I.currentEpoch);

  // ---- dependent batch: the epoch that just settled ----
  // Only meaningful once currentEpoch is known and >= 1; epoch 0 has no
  // predecessor, and `currentEpoch - 1` would underflow a uint256 read.
  const prevEpoch = currentEpoch !== null && currentEpoch >= 1n ? currentEpoch - 1n : null;

  const epochRead = useReadContracts({
    contracts: (pool && prevEpoch !== null
      ? [
          {
            abi: balcoreBankAbi,
            address: pool.bank,
            chainId: defaultChain.id,
            functionName: "epochs",
            args: [prevEpoch] as const,
          },
        ]
      : []) as never,
    allowFailure: true,
    query: { enabled: enabled && prevEpoch !== null },
  });

  const data = useMemo<UserPosition | null>(() => {
    if (!pool || !address || !enabled) return null;
    if (!results || results.length < CALL_COUNT) return null;

    const posTuple = tupleAt(results, I.positions);
    const shares = tupleBigint(posTuple, POS.shares);
    const entryEpoch = tupleBigint(posTuple, POS.entryEpoch);
    const lastClaimedEpoch = tupleBigint(posTuple, POS.lastClaimedEpoch);

    const totalShares = bigintAt(results, I.totalShares) ?? 0n;
    const totalAssets = bigintAt(results, I.totalAssets) ?? 0n;
    const price = bigintAt(results, I.lastValidPrice) ?? 0n;
    const pendingA = bigintAt(results, I.pendingBtcb) ?? 0n;
    const pendingB = bigintAt(results, I.pendingUsdc) ?? 0n;

    // Value against HOLDER-TVL, not totalAssets: with a basket earmarked (the
    // vault's current state) totalAssets overstates what backs live shares.
    const holder = holderTVL(totalAssets, pendingA, pendingB, price, pool.scaleA2B);
    const value = positionValue(shares, holder, totalShares);

    const claimTuple = tupleAt(results, I.claimable);
    const claimA = tupleBigint(claimTuple, 0);
    const claimB = tupleBigint(claimTuple, 1);

    const reqTuple = tupleAt(results, I.withdrawRequest);
    const reqShares = tupleBigint(reqTuple, 0);
    const readyAt = tupleBigint(reqTuple, 2);
    const executed = tupleBool(reqTuple, 3);
    const nowSec = BigInt(Math.floor(Date.now() / 1000));

    const basketTuple = tupleAt(results, I.basket);
    const basketA = tupleBigint(basketTuple, 0);
    const basketB = tupleBigint(basketTuple, 1);
    const strikeValue = tupleBigint(basketTuple, 2);

    const previewTuple = tupleAt(results, I.preview);
    const payableNow = tupleBigint(previewTuple, 0);
    const residual = tupleBigint(previewTuple, 1);

    // ---- last settled epoch's yield ----
    const epochTuple = tupleAt(
      epochRead.data as readonly { status: "success" | "failure"; result?: unknown }[] | undefined,
      0,
    );
    let lastWeekYield: bigint | null = null;
    if (epochTuple && prevEpoch !== null && shares > 0n) {
      const settled = tupleBool(epochTuple, EPOCH.settled);
      // Same skip as the on-chain loop: entry-epoch shares earn no LP fees.
      if (settled && entryEpoch < prevEpoch) {
        lastWeekYield = (shares * tupleBigint(epochTuple, EPOCH.usdcYieldPerShare)) / PRECISION;
      }
    }

    const decA = pool.tokenA.decimals;
    const decB = pool.tokenB.decimals;
    const depositVal = bigintAt(results, I.depositValue) ?? 0n;

    return {
      pool,
      address,
      shares,
      sharePct: totalShares > 0n ? Number((shares * 1_000_000n) / totalShares) / 10_000 : 0,
      positionValue: value,
      positionValueUsd: toFloat(value, decB),
      activated: boolAt(results, I.isActivated) ?? tupleBool(posTuple, POS.activated),
      entryEpoch,
      lastClaimedEpoch,
      queued: {
        tokenA: tupleBigint(posTuple, POS.queuedBtcb),
        tokenB: tupleBigint(posTuple, POS.queuedUsdc),
      },
      depositValue: depositVal,
      depositValueUsd: toFloat(depositVal, decB),
      claimable: { tokenA: claimA, tokenB: claimB, tokenBUsd: toFloat(claimB, decB) },
      withdrawRequest: {
        exists: reqShares > 0n,
        shares: reqShares,
        depositVal: tupleBigint(reqTuple, 1),
        readyAt,
        executed,
        ready: reqShares > 0n && !executed && readyAt > 0n && nowSec >= readyAt,
      },
      basket: {
        tokenA: basketA,
        tokenB: basketB,
        strikeValue,
        residualValue: tupleBigint(basketTuple, 3),
        tokenADisplay: toFloat(basketA, decA),
        tokenBDisplay: toFloat(basketB, decB),
        strikeValueUsd: toFloat(strikeValue, decB),
      },
      preview: {
        payableNow,
        residual,
        payableNowUsd: toFloat(payableNow, decB),
        residualUsd: toFloat(residual, decB),
      },
      lastWeekYield,
      lastWeekYieldUsd: lastWeekYield === null ? null : toFloat(lastWeekYield, decB),
    };
  }, [pool, address, enabled, results, epochRead.data, prevEpoch]);

  return {
    data,
    isLoading: enabled && (reads.isLoading || epochRead.isLoading),
    isError: reads.isError,
    pool,
    refetch: reads.refetch,
  };
}
