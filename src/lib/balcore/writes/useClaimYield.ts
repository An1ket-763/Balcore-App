/**
 * Claiming settled yield.
 *
 * `claimYield()` pays every settled epoch between the holder's claim cursor and
 * the current one, in tokens, straight to the caller (BalCoreBank.sol:1294-1311).
 * It reverts `NothingToClaim` in three different situations, and they want three
 * different sentences — which is why `checkClaimYield` distinguishes them rather
 * than disabling the button with one generic label:
 *
 *   - the caller never deposited (`shares == 0 && lastClaimedEpoch == 0`),
 *   - no epoch has settled since the last claim (`lastClaimedEpoch + 1 >=
 *     currentEpoch`) — the common case, and the one a user reads as "broken",
 *   - the range settled but credits nothing, because shares only earn from the
 *     epoch AFTER they activate (`pos.entryEpoch >= e` is skipped, :1342).
 *
 * THE THIRD ONE IS THE TRAP, and it is live right now: a deposit made this week
 * shows a zero claim until it has been through a Tuesday settlement, which looks
 * exactly like a bug if the UI just says "nothing to claim".
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
import type { Hex } from "viem";
import { defaultChain } from "@/lib/wagmi";
import { balcoreBankAbi } from "../abi/bank";
import { poolByKey, type BalcorePool, type PoolKey } from "../config/addresses";
import { checkClaimYield, type CheckResult } from "./checks";
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

export interface ClaimYieldHook extends WriteMachine {
  pool: BalcorePool | undefined;
  /** `getClaimableYield(user)` — tokenA leg and tokenB leg, in atoms. */
  claimable: { tokenA: bigint; usdc: bigint };
  /** Pre-checks. `checks.blocker.message` is the disabled reason. */
  checks: CheckResult;
  /** Convenience for the button: null when it may be pressed. */
  disabledReason: string | null;
  currentEpoch: bigint;
  lastClaimedEpoch: bigint;

  switchNetwork: () => void;
  claim: () => Promise<void>;
  dryRun: () => Promise<DryRunResult>;
}

const I = {
  claimable: 0,
  positions: 1,
  currentEpoch: 2,
  paused: 3,
} as const;

export function useClaimYield(key: PoolKey, options?: InspectOptions): ClaimYieldHook {
  const pool = poolByKey(key);
  const account = useAccount();
  const address = options?.inspectAs ?? account.address;
  const readOnly = Boolean(options?.inspectAs);
  const isConnected = readOnly ? true : account.isConnected;
  const { switchChain } = useSwitchChain();
  const net = useBalcoreNetwork(options);
  const publicClient = usePublicClient({ chainId: defaultChain.id });

  const [stage, setStage] = useState<WriteStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const ready = Boolean(pool && address && isConnected && !net.notDeployed);

  const contracts = useMemo(() => {
    if (!pool || !address) return [];
    const bank = { abi: balcoreBankAbi, address: pool.bank, chainId: defaultChain.id } as const;
    return [
      { ...bank, functionName: "getClaimableYield", args: [address] as const },
      { ...bank, functionName: "positions", args: [address] as const },
      { ...bank, functionName: "currentEpoch" },
      { ...bank, functionName: "paused" },
    ];
  }, [pool, address]);

  const reads = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled: ready },
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

  const claimTuple = tuple(I.claimable);
  const claimable = { tokenA: tBig(claimTuple, 0), usdc: tBig(claimTuple, 1) };

  const posTuple = tuple(I.positions);
  const lastClaimedEpoch = tBig(posTuple, 2);

  const currentEpoch = (() => {
    const e = r?.[I.currentEpoch];
    return e?.status === "success" && typeof e.result === "bigint" ? e.result : 0n;
  })();
  const paused = r?.[I.paused]?.status === "success" && r?.[I.paused]?.result === true;

  const checks = checkClaimYield({
    claimableUsdc: claimable.usdc,
    claimableTokenA: claimable.tokenA,
    paused,
    connected: net.connected,
    wrongNetwork: net.wrongNetwork,
    lastClaimedEpoch,
    currentEpoch,
  });

  const params = useMemo(() => {
    if (!pool) return null;
    return {
      abi: balcoreBankAbi,
      address: pool.bank,
      functionName: "claimYield",
      args: [] as const,
      chainId: defaultChain.id,
    } as const;
  }, [pool]);

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

  const claim = useCallback(async () => {
    if (!params || !address) return;
    if (readOnly) {
      setStage("error");
      setError(INSPECT_ONLY_ERROR);
      return;
    }
    setError(null);
    setStage("preparing");
    try {
      await simulateOrThrow(publicClient, params, address, "claimYield");
      setStage("signing");
      const hash = await write.writeContractAsync(params as never);
      setTxHash(hash);
      setStage("confirming");
    } catch (e) {
      setStage("error");
      setError(actionError(e, "claimYield"));
    }
  }, [params, address, publicClient, write, readOnly]);

  return {
    pool,
    stage,
    error,
    needsSwitch: net.wrongNetwork,
    isBusy: isBusyStage(stage) || receipt.isLoading,
    txHash,
    claimable,
    checks,
    disabledReason: checks.blocker?.message ?? null,
    currentEpoch,
    lastClaimedEpoch,
    switchNetwork: () => switchChain({ chainId: defaultChain.id }),
    claim,
    dryRun: () => dryRunCall(publicClient, params, address, "claimYield"),
    reset: useCallback(() => {
      setStage("idle");
      setError(null);
      setTxHash(null);
      write.reset();
    }, [write]),
  };
}
