/**
 * The standard withdrawal: request, wait, collect — or cancel.
 *
 * THREE THINGS ABOUT v1 THAT THE SCREEN HAS TO RESPECT, because each one
 * contradicts what a withdrawal form normally does:
 *
 *   1. `requestWithdraw()` TAKES NO AMOUNT. It exits the whole position
 *      (BalCoreBank.sol:681-775): it burns every share the caller holds, strikes
 *      a FROZEN token basket at that moment, and writes `readyAt = now + 7
 *      days`. There is no partial withdrawal in v1, so an amount field would be
 *      a lie with a slider on it.
 *
 *   2. The basket is frozen in TOKENS, not in dollars. From the request onward
 *      the exiter stops earning fees but still carries market movement, so the
 *      figure shown must come from `withdrawBasket` / `previewWithdraw` and not
 *      from a remembered dollar value.
 *
 *   3. `cancelWithdraw()` does not undo the request. It re-values the basket at
 *      TODAY's price and re-mints it as a NEW QUEUED DEPOSIT (:1401-1463), so
 *      the entry epoch and the 7-day clock are both gone. `CANCEL_CONSEQUENCE`
 *      in `checks.ts` is the sentence that has to appear next to the button.
 *
 * During a bank run (`runMode`, TRUE on the BTC pool today) `executeWithdraw`
 * serves the queue head only and reverts `NotHeadOfQueue` for anyone else
 * (:950-953). That is an EXPECTED revert, not an incident, and the message says
 * the user's place is held.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address, Hex } from "viem";
import { defaultChain } from "@/lib/wagmi";
import { balcoreBankAbi } from "../abi/bank";
import { poolByKey, type BalcorePool, type PoolKey } from "../config/addresses";
import {
  CANCEL_CONSEQUENCE,
  checkCancelWithdraw,
  checkExecuteWithdraw,
  checkRequestWithdraw,
  formatCountdown,
  secondsUntilReady,
  withdrawStatus,
  type CheckResult,
  type WithdrawStatus,
} from "./checks";
import {
  actionError,
  dryRunCall,
  isBusyStage,
  simulateOrThrow,
  useBalcoreNetwork,
  INSPECT_ONLY_ERROR,
  type DryRunResult,
  type InspectOptions,
  type WriteMachine,
  type WriteStage,
} from "./shared";

export interface WithdrawHook extends WriteMachine {
  pool: BalcorePool | undefined;
  /** Where this holder stands: none / pending / ready / partial / executed. */
  status: WithdrawStatus;

  /** The frozen basket, straight from `withdrawBasket(user)`. */
  basket: { tokenA: bigint; usdc: bigint; strikeValue: bigint; residualValue: bigint };
  /** `previewWithdraw(user)` — what would be paid now, and what would remain. */
  preview: { payableNow: bigint; residual: bigint };
  /** Unix seconds the request becomes collectable. 0n when there is none. */
  readyAt: bigint;
  /** Seconds left, and a rendered countdown. */
  secondsLeft: bigint;
  countdown: string;
  /** Live share balance — what `request()` would burn. */
  shares: bigint;
  runMode: boolean;
  /** The address at the front of the queue during a run, when readable. */
  queueHead: Address | null;

  /** Per-action pre-checks. */
  checks: { request: CheckResult; execute: CheckResult; cancel: CheckResult };
  /** The sentence that must be shown beside Cancel. */
  cancelConsequence: string;
  /** Which action the panel's primary button should run. */
  primaryAction: "request" | "execute" | "none";

  switchNetwork: () => void;
  request: () => Promise<void>;
  execute: () => Promise<void>;
  cancel: () => Promise<void>;
  dryRun: (which: "request" | "execute" | "cancel") => Promise<DryRunResult>;
}

const I = {
  positions: 0,
  withdrawRequests: 1,
  withdrawBasket: 2,
  preview: 3,
  runMode: 4,
  paused: 5,
  runHead: 6,
} as const;

export function useWithdraw(key: PoolKey, options?: InspectOptions): WithdrawHook {
  const pool = poolByKey(key);
  const account = useAccount();
  // Inspect mode reads and dry-runs as somebody else; see InspectOptions.
  const address = options?.inspectAs ?? account.address;
  const readOnly = Boolean(options?.inspectAs);
  const isConnected = readOnly ? true : account.isConnected;
  const { switchChain } = useSwitchChain();
  const net = useBalcoreNetwork(options);
  const publicClient = usePublicClient({ chainId: defaultChain.id });

  const [stage, setStage] = useState<WriteStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  /** Re-rendered every 30s so the countdown and the ready flip are live. */
  const [nowSec, setNowSec] = useState<bigint>(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const t = setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 30_000);
    return () => clearInterval(t);
  }, []);

  const ready = Boolean(pool && address && isConnected && !net.notDeployed);

  const contracts = useMemo(() => {
    if (!pool || !address) return [];
    const bank = { abi: balcoreBankAbi, address: pool.bank, chainId: defaultChain.id } as const;
    const forUser = [address] as const;
    return [
      { ...bank, functionName: "positions", args: forUser },
      { ...bank, functionName: "withdrawRequests", args: forUser },
      { ...bank, functionName: "withdrawBasket", args: forUser },
      { ...bank, functionName: "previewWithdraw", args: forUser },
      { ...bank, functionName: "runMode" },
      { ...bank, functionName: "paused" },
      { ...bank, functionName: "runHead" },
    ];
  }, [pool, address]);

  const reads = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled: ready, refetchInterval: ready ? 20_000 : false },
  });

  const r = reads.data as
    readonly { status: "success" | "failure"; result?: unknown }[] | undefined;
  const tuple = (i: number): readonly unknown[] | null => {
    const e = r?.[i];
    return e?.status === "success" && Array.isArray(e.result)
      ? (e.result as readonly unknown[])
      : null;
  };
  const tBig = (t: readonly unknown[] | null, at: number): bigint =>
    typeof t?.[at] === "bigint" ? (t[at] as bigint) : 0n;
  const big = (i: number): bigint => {
    const e = r?.[i];
    return e?.status === "success" && typeof e.result === "bigint" ? e.result : 0n;
  };
  const bool = (i: number): boolean => {
    const e = r?.[i];
    return e?.status === "success" && e.result === true;
  };

  const shares = tBig(tuple(I.positions), 0);

  const reqTuple = tuple(I.withdrawRequests);
  const requestShares = tBig(reqTuple, 0);
  const readyAt = tBig(reqTuple, 2);
  const requestExecuted = reqTuple?.[3] === true;

  const basketTuple = tuple(I.withdrawBasket);
  const basket = {
    tokenA: tBig(basketTuple, 0),
    usdc: tBig(basketTuple, 1),
    strikeValue: tBig(basketTuple, 2),
    residualValue: tBig(basketTuple, 3),
  };

  const previewTuple = tuple(I.preview);
  const preview = {
    payableNow: tBig(previewTuple, 0),
    residual: tBig(previewTuple, 1),
  };

  const runMode = bool(I.runMode);
  const paused = bool(I.paused);

  const status = withdrawStatus({
    requestShares,
    requestExecuted,
    readyAt,
    residualValue: basket.residualValue,
    nowSec,
  });

  /**
   * Who is at the front of the queue.
   *
   * `runQueue` is a public array and `runHead` its cursor, so the head is
   * `runQueue(runHead)` — a second read that only makes sense once `runHead` is
   * known, and only during a run. Off a run the queue imposes no ordering at
   * all, so it is not read.
   */
  const headRead = useReadContracts({
    contracts: (pool && runMode
      ? [
          {
            abi: balcoreBankAbi,
            address: pool.bank,
            chainId: defaultChain.id,
            functionName: "runQueue",
            args: [big(I.runHead)] as const,
          },
        ]
      : []) as never,
    allowFailure: true,
    query: { enabled: Boolean(pool && runMode && ready) },
  });
  const queueHead = (() => {
    const e = (
      headRead.data as readonly { status: "success" | "failure"; result?: unknown }[] | undefined
    )?.[0];
    return e?.status === "success" && typeof e.result === "string" ? (e.result as Address) : null;
  })();

  /* ---- checks ---- */
  const common = {
    status,
    shares,
    paused,
    poolLive: pool?.status === "live",
    connected: net.connected,
    wrongNetwork: net.wrongNetwork,
    runMode,
    queueHead,
    user: address ?? null,
  };

  const checks = {
    request: checkRequestWithdraw(common),
    execute: checkExecuteWithdraw({ ...common, readyAt, nowSec }),
    cancel: checkCancelWithdraw({
      status,
      paused,
      connected: net.connected,
      wrongNetwork: net.wrongNetwork,
      holdsShares: shares > 0n,
    }),
  };

  const primaryAction: "request" | "execute" | "none" =
    status === "none" || status === "executed"
      ? shares > 0n
        ? "request"
        : "none"
      : status === "ready" || status === "partial"
        ? "execute"
        : "none";

  /* ---- transactions ---- */
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: defaultChain.id,
  });

  useEffect(() => {
    if (receipt.isSuccess) {
      setStage("done");
      reads.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const paramsFor = useCallback(
    (fn: "requestWithdraw" | "executeWithdraw" | "cancelWithdraw") => {
      if (!pool) return null;
      return {
        abi: balcoreBankAbi,
        address: pool.bank,
        functionName: fn,
        args: [] as const,
        chainId: defaultChain.id,
      } as const;
    },
    [pool],
  );

  const run = useCallback(
    async (
      fn: "requestWithdraw" | "executeWithdraw" | "cancelWithdraw",
      context: "requestWithdraw" | "executeWithdraw" | "cancelWithdraw",
    ) => {
      const params = paramsFor(fn);
      if (!params || !address) return;
      if (readOnly) {
        setStage("error");
        setError(INSPECT_ONLY_ERROR);
        return;
      }
      setError(null);
      setStage("preparing");
      try {
        await simulateOrThrow(publicClient, params, address, context);
        setStage("signing");
        const hash = await write.writeContractAsync(params as never);
        setTxHash(hash);
        setStage("confirming");
      } catch (e) {
        setStage("error");
        setError(actionError(e, context));
      }
    },
    [paramsFor, address, publicClient, write, readOnly],
  );

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setTxHash(null);
    write.reset();
  }, [write]);

  return {
    pool,
    stage,
    error,
    needsSwitch: net.wrongNetwork,
    isBusy: isBusyStage(stage) || receipt.isLoading,
    txHash,
    status,
    basket,
    preview,
    readyAt,
    secondsLeft: secondsUntilReady(readyAt, nowSec),
    countdown: formatCountdown(secondsUntilReady(readyAt, nowSec)),
    shares,
    runMode,
    queueHead,
    checks,
    cancelConsequence: CANCEL_CONSEQUENCE,
    primaryAction,
    switchNetwork: () => switchChain({ chainId: defaultChain.id }),
    request: () => run("requestWithdraw", "requestWithdraw"),
    execute: () => run("executeWithdraw", "executeWithdraw"),
    cancel: () => run("cancelWithdraw", "cancelWithdraw"),
    dryRun: (which) =>
      dryRunCall(
        publicClient,
        paramsFor(
          which === "request"
            ? "requestWithdraw"
            : which === "execute"
              ? "executeWithdraw"
              : "cancelWithdraw",
        ),
        address,
        which === "request"
          ? "requestWithdraw"
          : which === "execute"
            ? "executeWithdraw"
            : "cancelWithdraw",
      ),
    reset,
  };
}
