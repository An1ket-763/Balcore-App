import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWaitForTransactionReceipt } from "wagmi";
import { chainByKey } from "@/lib/cctp";
import { fetchAttestation, type Attestation } from "@/lib/cctpApi";
import type { PendingTransfer } from "./bridgeTransfers";
import type { Hex } from "viem";

/**
 * Poll Circle until it has signed the burn, then write the proof down.
 *
 * The message and attestation are the two things `receiveMessage` needs, and
 * they are only obtainable from Circle. Persisting them the moment they arrive
 * means a refresh at the wrong second cannot cost the user their funds.
 */
export interface AttestationWatch {
  data: Attestation | null | undefined;
  /** True while Circle has not signed yet — the normal waiting state. */
  isWaiting: boolean;
  /** True when the lookup itself is failing, which is different from waiting. */
  isError: boolean;
}

const POLL_MS = 6_000;

/**
 * Watch a restored transfer's burn transaction.
 *
 * The burn hook only knows about a burn it started itself, so after a refresh
 * nothing is checking whether that transaction actually succeeded. A reverted
 * burn would otherwise sit in "waiting for Circle" forever, waiting on a
 * message that was never emitted.
 */
export function useBurnReceiptWatch(
  transfer: PendingTransfer | null,
  onConfirmed: (burnTxHash: Hex) => void,
  onReverted: (burnTxHash: Hex) => void,
): void {
  const source = transfer ? chainByKey(transfer.sourceKey) : null;
  const watching = Boolean(transfer && transfer.status === "burning" && source);

  const receipt = useWaitForTransactionReceipt({
    hash: watching ? transfer!.burnTxHash : undefined,
    chainId: source?.chainId,
  });

  useEffect(() => {
    if (!watching || !transfer || !receipt.data) return;
    if (receipt.data.status === "reverted") onReverted(transfer.burnTxHash);
    else onConfirmed(transfer.burnTxHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.data?.status, transfer?.burnTxHash, watching]);
}

export function useBridgeAttestation(
  transfer: PendingTransfer | null,
  onSigned: (burnTxHash: Hex, message: Hex, attestation: Hex) => void,
): AttestationWatch {
  // Only poll while there is something to wait for. A transfer already marked
  // ready or minted has its proof saved and needs no further traffic.
  const enabled = Boolean(
    transfer && (transfer.status === "burning" || transfer.status === "attesting"),
  );

  const query = useQuery<Attestation | null>({
    queryKey: ["cctp-attestation", transfer?.sourceDomain, transfer?.burnTxHash],
    queryFn: ({ signal }) => fetchAttestation(transfer!.sourceDomain, transfer!.burnTxHash, signal),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
    // Keep polling in the background: a Standard transfer takes long enough
    // that the user will very likely switch tabs while waiting.
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 2,
  });

  const signed =
    query.data?.status === "complete" && query.data.message && query.data.attestation
      ? { message: query.data.message, attestation: query.data.attestation }
      : null;

  useEffect(() => {
    if (!transfer || !signed) return;
    onSigned(transfer.burnTxHash, signed.message, signed.attestation);
    // onSigned is intentionally excluded: it is recreated on every render by the
    // caller, and re-running this on identity changes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer?.burnTxHash, signed?.message, signed?.attestation]);

  return {
    data: query.data,
    isWaiting: enabled && !signed,
    isError: enabled && query.isError,
  };
}
