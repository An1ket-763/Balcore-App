import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Hex } from "viem";
import { MESSAGE_TRANSMITTER_V2, chainByKey, messageTransmitterV2Abi } from "@/lib/cctp";
import { PreflightError, isRevert, revertName } from "@/lib/txPreflight";
import type { PendingTransfer } from "./bridgeTransfers";

/**
 * The destination-chain half: hand Circle's message and signature to
 * `receiveMessage` and the USDC is minted.
 *
 * Two things make this different from the burn.
 *
 * 1. THE GAS PROBLEM. This transaction is paid for on the DESTINATION chain. A
 *    user bridging into Avalanche for the first time holds no AVAX and cannot
 *    pay for their own mint. There is no way around that client-side — the fix
 *    is a relayer, which the zeroed `destinationCaller` on the burn already
 *    allows. Until then the honest thing is to say so plainly.
 *
 * 2. ALREADY MINTED IS NOT A FAILURE. `receiveMessage` reverts with
 *    "Nonce already used" if the message has been consumed — by a retry, or by
 *    anyone else who relayed it. The money has arrived. Showing that as an
 *    error would send the user hunting for funds that are already in their
 *    wallet, so it is detected during simulation and treated as success.
 */
export type MintStage = "idle" | "preparing" | "signing" | "confirming" | "minted" | "error";

export interface BridgeMint {
  stage: MintStage;
  error: string | null;
  mintTxHash: Hex | null;
  needsSwitch: boolean;
  /** No native token on the destination chain to pay for the mint. */
  noDestinationGas: boolean;
  /** The message was already consumed — the USDC has arrived. */
  alreadyMinted: boolean;
  isBusy: boolean;
  switchToDestination: () => void;
  mint: () => Promise<void>;
  reset: () => void;
}

export function useBridgeMint(
  transfer: PendingTransfer | null,
  onMinted: (burnTxHash: Hex, mintTxHash: Hex | null) => void,
): BridgeMint {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const destination = transfer ? chainByKey(transfer.destinationKey) : null;
  const publicClient = usePublicClient({ chainId: destination?.chainId });

  const [stage, setStage] = useState<MintStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<Hex | null>(null);
  const [alreadyMinted, setAlreadyMinted] = useState(false);

  const claimable = Boolean(
    transfer?.status === "ready" && transfer.message && transfer.attestation && destination,
  );

  const nativeBalance = useBalance({
    address,
    chainId: destination?.chainId,
    query: { enabled: Boolean(address && isConnected && destination) },
  });
  const noDestinationGas =
    claimable && nativeBalance.data !== undefined && nativeBalance.data.value === 0n;

  const needsSwitch = Boolean(claimable && destination && chainId !== destination.chainId);

  const mintTx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: mintTxHash ?? undefined,
    chainId: destination?.chainId,
  });

  useEffect(() => {
    // Require the hash too: a receipt hook can report success for a stale or
    // absent hash, and marking a transfer minted on that would be a lie.
    if (!receipt.isSuccess || !mintTxHash || !transfer) return;
    setStage("minted");
    onMinted(transfer.burnTxHash, mintTxHash);
    // onMinted is recreated each render by the caller; including it loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess, mintTxHash]);

  // An already-consumed message means the funds landed without this wallet
  // paying for it. Record it exactly like a successful mint.
  useEffect(() => {
    if (!alreadyMinted || !transfer) return;
    setStage("minted");
    onMinted(transfer.burnTxHash, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyMinted]);

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setMintTxHash(null);
    setAlreadyMinted(false);
    mintTx.reset();
  }, [mintTx]);

  const switchToDestination = useCallback(() => {
    if (destination) switchChain({ chainId: destination.chainId });
  }, [destination, switchChain]);

  const mint = useCallback(async () => {
    if (!transfer || !destination || !address) return;
    const { message, attestation } = transfer;
    if (!message || !attestation) {
      setStage("error");
      setError("Circle's proof is missing — wait for the attestation");
      return;
    }

    const params = {
      abi: messageTransmitterV2Abi,
      address: MESSAGE_TRANSMITTER_V2,
      functionName: "receiveMessage",
      // Both handed over exactly as Circle produced them. Any alteration
      // invalidates the signature.
      args: [message, attestation],
      chainId: destination.chainId,
    } as const;

    setError(null);
    setStage("preparing");
    try {
      if (publicClient) {
        try {
          await publicClient.simulateContract({ ...params, account: address });
        } catch (e) {
          const reason = `${revertName(e) ?? ""} ${e instanceof Error ? e.message : ""}`;
          if (/nonce already used/i.test(reason)) {
            setAlreadyMinted(true);
            return;
          }
          if (isRevert(e)) {
            throw new PreflightError(
              revertName(e)
                ? `Claim would fail: ${revertName(e)}`
                : "Claim would fail on-chain — Circle's proof may not be final yet",
            );
          }
          console.warn("[balcore] mint pre-flight skipped:", e);
        }
      }

      setStage("signing");
      const hash = await mintTx.writeContractAsync(params);
      setMintTxHash(hash);
      setStage("confirming");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // The same revert can arrive from the wallet rather than the dry run.
      if (/nonce already used/i.test(msg)) {
        setAlreadyMinted(true);
        return;
      }
      setStage("error");
      setError(e instanceof PreflightError ? e.message : shortMintError(e));
    }
  }, [transfer, destination, address, publicClient, mintTx]);

  const isBusy = stage === "preparing" || stage === "signing" || stage === "confirming";

  return {
    stage,
    error,
    mintTxHash,
    needsSwitch,
    noDestinationGas,
    alreadyMinted,
    isBusy,
    switchToDestination,
    mint,
    reset,
  };
}

function shortMintError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/User rejected|rejected the request|denied/i.test(msg))
    return "Rejected in wallet — tap to retry";
  if (/insufficient funds/i.test(msg)) return "Not enough gas to claim — tap to retry";
  return "Claim failed — tap to retry";
}
