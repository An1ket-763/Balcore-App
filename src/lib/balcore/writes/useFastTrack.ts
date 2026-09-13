/**
 * The instant exit.
 *
 * `fastTrackWithdraw()` pays the whole position out now, at today's value, minus
 * a flat 3% (BalCoreBank.sol:1095-1185). What it does NOT do is the part the UI
 * has to say out loud: there is **no impermanent-loss cover on this path**. The
 * standard withdrawal draws three layers of IL coverage — the IL fund, then the
 * unified reserve, then the backup fund (:982-994) — and the fast-track draws
 * none of them. A user choosing "instant" is trading the IL floor plus 3% for
 * the 7-day wait, and they can only make that trade if they are told.
 *
 * It is also all-or-nothing by design. The standard path can pay a tranche and
 * leave the rest claimable; this one reverts `FastTrackPoolInsufficient` rather
 * than partially deliver (:1142-1146), because a partial instant exit is the
 * worst of both.
 *
 * TODAY, ON MAINNET, THIS PATH IS CLOSED: the BTC pool is in `runMode` and the
 * first gate is `FastTrackSuspendedDuringRun` (:1096). The option must render
 * greyed with that reason, which is correct behaviour and not a defect.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Hex } from "viem";
import { defaultChain } from "@/lib/wagmi";
import { balcoreBankAbi } from "../abi/bank";
import { poolByKey, type BalcorePool, type PoolKey } from "../config/addresses";
import { useFastTrackAvailability } from "../reads/useFastTrackAvailability";
import { useUserPosition } from "../reads/useUserPosition";
import {
  checkFastTrack,
  previewFastTrack,
  type CheckResult,
  type FastTrackPreview,
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

export interface FastTrackHook extends WriteMachine {
  pool: BalcorePool | undefined;
  /** Pool-level availability, with the exact reason when it is off. */
  available: boolean;
  unavailableReason: string | null;
  /** True right now on the BTC pool: the queue is being served in order. */
  runMode: boolean;
  /** Gross / 3% fee / net, computed the way the contract computes it. */
  preview: FastTrackPreview;
  /** Remaining room under today's 5%-of-TVL cap, tokenB atoms. */
  dailyCapRemaining: bigint;
  /** What the vault could hand over right now, net of reserved residuals. */
  sourceableNet: bigint;
  checks: CheckResult;
  /** null when the button may be pressed; otherwise the exact reason. */
  disabledReason: string | null;
  /** The warning that must be shown even when the path IS available. */
  noIlCoverWarning: string;

  switchNetwork: () => void;
  instant: () => Promise<void>;
  dryRun: () => Promise<DryRunResult>;
}

/** Said once, here, so both the hook and the panel quote the same sentence. */
export const NO_IL_COVER_WARNING =
  "Instant withdrawal pays today's value minus a 3% fee and carries NO impermanent-loss cover. The standard 7-day withdrawal has both the cover and no fee.";

export function useFastTrack(key: PoolKey, options?: InspectOptions): FastTrackHook {
  const pool = poolByKey(key);
  const account = useAccount();
  const address = options?.inspectAs ?? account.address;
  const readOnly = Boolean(options?.inspectAs);
  const { switchChain } = useSwitchChain();
  const net = useBalcoreNetwork(options);
  const publicClient = usePublicClient({ chainId: defaultChain.id });

  const [stage, setStage] = useState<WriteStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  // Both reads already exist and are already correct; re-deriving the cap or
  // the holder-TVL here would be a second dialect of the same arithmetic.
  const availability = useFastTrackAvailability(key);
  const position = useUserPosition(key, address);

  const shares = position.data?.shares ?? 0n;
  const positionValue = position.data?.positionValue ?? 0n;
  const preview = previewFastTrack(positionValue);

  const checks = useMemo(
    () =>
      checkFastTrack({
        shares,
        positionValue,
        paused: availability.data?.paused ?? false,
        poolLive: pool?.status === "live",
        connected: net.connected,
        wrongNetwork: net.wrongNetwork,
        available: availability.data?.available ?? false,
        unavailableReason: availability.data?.reason ?? null,
        fitsAmount: availability.data?.fitsAmount(positionValue) ?? false,
      }),
    [shares, positionValue, availability.data, pool?.status, net.connected, net.wrongNetwork],
  );

  const params = useMemo(() => {
    if (!pool) return null;
    return {
      abi: balcoreBankAbi,
      address: pool.bank,
      functionName: "fastTrackWithdraw",
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
      availability.refetch();
      position.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const instant = useCallback(async () => {
    if (!params || !address) return;
    if (readOnly) {
      setStage("error");
      setError(INSPECT_ONLY_ERROR);
      return;
    }
    setError(null);
    setStage("preparing");
    try {
      await simulateOrThrow(publicClient, params, address, "fastTrack");
      setStage("signing");
      const hash = await write.writeContractAsync(params as never);
      setTxHash(hash);
      setStage("confirming");
    } catch (e) {
      setStage("error");
      setError(actionError(e, "fastTrack"));
    }
  }, [params, address, publicClient, write, readOnly]);

  return {
    pool,
    stage,
    error,
    needsSwitch: net.wrongNetwork,
    isBusy: isBusyStage(stage) || receipt.isLoading,
    txHash,
    available: availability.data?.available ?? false,
    unavailableReason: availability.data?.reason ?? null,
    runMode: availability.data?.runMode ?? false,
    preview,
    dailyCapRemaining: availability.data?.dailyCapRemaining ?? 0n,
    sourceableNet: availability.data?.sourceableNet ?? 0n,
    checks,
    disabledReason: checks.blocker?.message ?? null,
    noIlCoverWarning: NO_IL_COVER_WARNING,
    switchNetwork: () => switchChain({ chainId: defaultChain.id }),
    instant,
    dryRun: () => dryRunCall(publicClient, params, address, "fastTrack"),
    reset: useCallback(() => {
      setStage("idle");
      setError(null);
      setTxHash(null);
      write.reset();
    }, [write]),
  };
}
