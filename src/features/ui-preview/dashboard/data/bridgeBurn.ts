import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address, Hex } from "viem";
import {
  ANY_CALLER,
  FINALITY,
  TOKEN_MESSENGER_V2,
  addressToBytes32,
  maxFeeFor,
  tokenMessengerV2Abi,
  type BridgeChain,
  type TransferSpeed,
} from "@/lib/cctp";
import { erc20ApprovalAbi } from "@/lib/lfjSwap";
import { PreflightError, isRevert, revertName } from "@/lib/txPreflight";

/**
 * The source-chain half of a CCTP transfer: approve USDC, then burn it.
 *
 * THE BURN IS THE POINT OF NO RETURN. Once `depositForBurn` confirms, the USDC
 * no longer exists on the source chain and only Circle's attestation plus a
 * `receiveMessage` on the destination can bring it back. Everything here is
 * therefore checked before the wallet opens, not after:
 *   - the wallet is on the right chain,
 *   - it holds native gas to pay for the transaction,
 *   - the allowance covers the amount,
 *   - and the exact call simulates cleanly against the chain.
 */
export type BurnStage =
  "idle" | "approving" | "preparing" | "signing" | "confirming" | "burned" | "error";

export interface BridgeBurn {
  stage: BurnStage;
  error: string | null;
  /** Set once the burn is mined. Step 5 polls Circle with this. */
  burnTxHash: Hex | null;
  needsApproval: boolean;
  needsSwitch: boolean;
  /** Wallet holds no native token on the source chain to pay the fee with. */
  noSourceGas: boolean;
  isBusy: boolean;
  switchToSource: () => void;
  approve: () => Promise<void>;
  burn: () => Promise<void>;
  reset: () => void;
}

export function useBridgeBurn(
  source: BridgeChain | null,
  destination: BridgeChain | null,
  amountWei: bigint,
  speed: TransferSpeed,
  feeBps: number | null,
): BridgeBurn {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: source?.chainId });

  const [stage, setStage] = useState<BurnStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [burnTxHash, setBurnTxHash] = useState<Hex | null>(null);

  const ready = Boolean(address && isConnected && source && destination);

  // ---- native gas on the SOURCE chain ----
  // Distinct from the swap's AVAX reserve: USDC is an ERC-20, so the fee is not
  // taken out of the amount. What matters is simply whether the wallet has any
  // native token on the chain the burn goes out on.
  const nativeBalance = useBalance({
    address,
    chainId: source?.chainId,
    query: { enabled: ready },
  });
  const noSourceGas = ready && nativeBalance.data !== undefined && nativeBalance.data.value === 0n;

  // ---- allowance for the TokenMessenger ----
  const allowance = useReadContract({
    abi: erc20ApprovalAbi,
    address: source?.usdc,
    functionName: "allowance",
    args: address ? [address, TOKEN_MESSENGER_V2] : undefined,
    chainId: source?.chainId,
    query: { enabled: ready },
  });
  const needsApproval =
    amountWei > 0n && (typeof allowance.data === "bigint" ? allowance.data < amountWei : true);

  const needsSwitch = Boolean(ready && source && chainId !== source.chainId);

  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveTx.data,
    chainId: source?.chainId,
  });
  const burnTx = useWriteContract();
  const burnReceipt = useWaitForTransactionReceipt({
    hash: burnTxHash ?? undefined,
    chainId: source?.chainId,
  });

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      allowance.refetch();
      setStage("idle");
    }
  }, [approveReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (burnReceipt.isSuccess) setStage("burned");
  }, [burnReceipt.isSuccess]);

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setBurnTxHash(null);
    approveTx.reset();
    burnTx.reset();
  }, [approveTx, burnTx]);

  const switchToSource = useCallback(() => {
    if (source) switchChain({ chainId: source.chainId });
  }, [source, switchChain]);

  const approve = useCallback(async () => {
    if (!source || amountWei <= 0n) return;
    setError(null);
    setStage("approving");
    try {
      await approveTx.writeContractAsync({
        abi: erc20ApprovalAbi,
        address: source.usdc,
        functionName: "approve",
        // Exactly the amount being bridged — no unlimited allowance left behind
        // on a contract the user may never interact with again.
        args: [TOKEN_MESSENGER_V2, amountWei],
        chainId: source.chainId,
      });
    } catch (e) {
      setStage("error");
      setError(shortBurnError(e, "Approval failed"));
    }
  }, [source, amountWei, approveTx]);

  const burn = useCallback(async () => {
    if (!source || !destination || !address || amountWei <= 0n) return;

    const maxFee = maxFeeFor(speed, amountWei, feeBps);
    // A Fast burn whose ceiling is zero reverts on-chain. Refusing here means
    // the user never pays gas to discover that.
    if (speed === "fast" && maxFee <= 0n) {
      setStage("error");
      setError("No fee quote from Circle — switch to Standard or retry");
      return;
    }

    const params = {
      abi: tokenMessengerV2Abi,
      address: TOKEN_MESSENGER_V2,
      functionName: "depositForBurn",
      args: [
        amountWei,
        destination.domain,
        // Left-padded to bytes32. The same wallet receives on the far side.
        addressToBytes32(address as Address),
        source.usdc,
        // Zero: anyone may complete the mint, which is what allows a relayer
        // to pay the destination gas later without redeploying anything.
        ANY_CALLER,
        maxFee,
        FINALITY[speed],
      ],
      chainId: source.chainId,
    } as const;

    setError(null);
    setStage("preparing");
    try {
      // Dry run first. A revert here costs nothing; the same revert after
      // signing costs gas and still burns nothing, but the user has paid.
      if (publicClient) {
        try {
          await publicClient.simulateContract({ ...params, account: address });
        } catch (e) {
          if (isRevert(e)) {
            const name = revertName(e);
            throw new PreflightError(
              name ? `Burn would fail: ${name}` : "Burn would fail on-chain — check the amount",
            );
          }
          // Unreachable node: fall through and let the wallet estimate.
          console.warn("[balcore] burn pre-flight skipped:", e);
        }
      }

      setStage("signing");
      const hash = await burnTx.writeContractAsync(params);
      setBurnTxHash(hash);
      setStage("confirming");
    } catch (e) {
      setStage("error");
      setError(
        e instanceof PreflightError ? e.message : shortBurnError(e, "Burn failed — tap to retry"),
      );
    }
  }, [source, destination, address, amountWei, speed, feeBps, publicClient, burnTx]);

  const isBusy =
    stage === "approving" ||
    stage === "preparing" ||
    stage === "signing" ||
    stage === "confirming" ||
    approveReceipt.isLoading;

  return {
    stage,
    error,
    burnTxHash,
    needsApproval,
    needsSwitch,
    noSourceGas,
    isBusy,
    switchToSource,
    approve,
    burn,
    reset,
  };
}

/** Wallet and RPC errors are novel-length; the CTA has room for a hint. */
function shortBurnError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  if (/User rejected|rejected the request|denied/i.test(msg))
    return "Rejected in wallet — tap to retry";
  if (/insufficient funds/i.test(msg)) return "Not enough gas on this chain — tap to retry";
  if (/chain mismatch|does not match the target chain/i.test(msg))
    return "Wrong network — switch and retry";
  return fallback;
}
