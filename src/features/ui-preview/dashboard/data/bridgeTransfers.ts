import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { isMainnet } from "@/lib/wagmi";
import type { TransferSpeed } from "@/lib/cctp";

/**
 * Durable record of a bridge that is mid-flight.
 *
 * This is the safety net for the whole feature. Once `depositForBurn` confirms,
 * the user's USDC no longer exists on the source chain and the ONLY way to get
 * it back is to hand Circle's message plus attestation to `receiveMessage` on
 * the destination. If the app forgets the burn transaction hash — a refresh, a
 * closed tab, a crash — the funds sit in limbo until someone digs the hash out
 * of a block explorer. Persisting is therefore a correctness requirement, not a
 * convenience.
 *
 * Everything here is deliberately synchronous and dumb: no network, no React
 * state, so the write can happen the instant a hash exists.
 */

export type TransferStatus =
  /** Burn submitted, not yet mined. */
  | "burning"
  /** Burn mined; waiting for Circle to sign. */
  | "attesting"
  /** Circle has signed. The mint can be sent. */
  | "ready"
  /** Minted on the destination. Kept briefly so the UI can confirm it. */
  | "minted"
  /**
   * The burn transaction reverted, so nothing was ever sent. Distinct from
   * every other state: there is no message to wait for and no funds in flight,
   * and treating it as "attesting" would leave the user staring at a spinner
   * for a transfer that will never arrive.
   */
  | "failed";

export interface PendingTransfer {
  /** The burn transaction hash, which also identifies the record. */
  burnTxHash: Hex;
  sourceKey: string;
  destinationKey: string;
  sourceDomain: number;
  destinationDomain: number;
  /**
   * USDC in smallest units, stored as a STRING.
   *
   * JSON.stringify throws on a bigint. Storing the number instead would lose
   * precision on large amounts, so the string is the only safe shape here.
   */
  amount: string;
  speed: TransferSpeed;
  status: TransferStatus;
  createdAt: number;
  /** Circle's message bytes, once Iris has them. */
  message?: Hex;
  /** Circle's signature, once the attestation is complete. */
  attestation?: Hex;
  /** The mint transaction, once it has been sent. */
  mintTxHash?: Hex;
}

/**
 * Records are scoped to BOTH the wallet and the network.
 *
 * Without the network in the key a Fuji rehearsal would reappear as a pending
 * mainnet transfer, pointing the mint at contracts on the wrong chain.
 */
export function storageKey(address: string | undefined): string | null {
  if (!address) return null;
  return `balcore-bridge-pending:${isMainnet ? "mainnet" : "testnet"}:${address.toLowerCase()}`;
}

/**
 * Read the saved transfers.
 *
 * Every failure mode returns an empty list rather than throwing: storage can be
 * disabled, full, or hold something a previous version wrote. Losing the list
 * is bad, but crashing the panel that is meant to recover the funds is worse.
 */
export function readTransfers(address: string | undefined): PendingTransfer[] {
  const key = storageKey(address);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop long-finished transfers on the way out, so the list cannot grow
    // without bound behind the user's back.
    const now = Date.now();
    return parsed
      .filter(isTransfer)
      .filter((t) => t.status !== "minted" || now - t.createdAt < MINTED_RETENTION_MS);
  } catch {
    return [];
  }
}

function isTransfer(value: unknown): value is PendingTransfer {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<PendingTransfer>;
  return (
    typeof t.burnTxHash === "string" &&
    t.burnTxHash.startsWith("0x") &&
    typeof t.amount === "string" &&
    typeof t.sourceDomain === "number" &&
    typeof t.destinationDomain === "number"
  );
}

/** Overwrite the list. Returns false when storage refused the write. */
export function writeTransfers(address: string | undefined, list: PendingTransfer[]): boolean {
  const key = storageKey(address);
  if (!key) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Insert or replace one transfer, newest first. */
export function upsertTransfer(
  list: PendingTransfer[],
  transfer: PendingTransfer,
): PendingTransfer[] {
  const rest = list.filter((t) => t.burnTxHash.toLowerCase() !== transfer.burnTxHash.toLowerCase());
  return [transfer, ...rest];
}

export function removeTransfer(list: PendingTransfer[], burnTxHash: Hex): PendingTransfer[] {
  return list.filter((t) => t.burnTxHash.toLowerCase() !== burnTxHash.toLowerCase());
}

/** A minted record is kept this long so the user can see it, then pruned. */
export const MINTED_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * The most recent completed transfer still worth showing.
 *
 * Without this, a mint followed by a refresh leaves a record that is invisible
 * (activeTransfer skips minted ones) yet never cleaned up, so storage quietly
 * fills with finished transfers the user can neither see nor dismiss.
 */
export function recentlyMinted(list: PendingTransfer[], now = Date.now()): PendingTransfer | null {
  const done = list.filter((t) => t.status === "minted" && now - t.createdAt < MINTED_RETENTION_MS);
  if (done.length === 0) return null;
  return done.reduce((newest, t) => (t.createdAt > newest.createdAt ? t : newest));
}

/**
 * The transfer the panel should be showing: the oldest one still unfinished.
 *
 * Oldest rather than newest, because a transfer that has been waiting longest
 * is the one most in need of attention.
 */
export function activeTransfer(list: PendingTransfer[]): PendingTransfer | null {
  const open = list.filter((t) => t.status !== "minted");
  if (open.length === 0) return null;
  return open.reduce((oldest, t) => (t.createdAt < oldest.createdAt ? t : oldest));
}

/* ------------------------------------------------------------------ */
/* React binding                                                       */
/* ------------------------------------------------------------------ */

export interface BridgeTransfers {
  transfers: PendingTransfer[];
  active: PendingTransfer | null;
  /** A just-finished transfer, so it survives a refresh until dismissed. */
  justMinted: PendingTransfer | null;
  /**
   * False when the browser refused to persist. The UI must warn: an in-flight
   * burn that is not written down can be lost on refresh.
   */
  canPersist: boolean;
  save: (transfer: PendingTransfer) => void;
  patch: (burnTxHash: Hex, changes: Partial<PendingTransfer>) => void;
  drop: (burnTxHash: Hex) => void;
}

export function useBridgeTransfers(address: string | undefined): BridgeTransfers {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [canPersist, setCanPersist] = useState(true);

  // Reload whenever the wallet changes, so one wallet never sees another's
  // in-flight transfers.
  useEffect(() => {
    setTransfers(readTransfers(address));
  }, [address]);

  const commit = useCallback(
    (next: PendingTransfer[]) => {
      setTransfers(next);
      setCanPersist(writeTransfers(address, next));
    },
    [address],
  );

  const save = useCallback(
    (transfer: PendingTransfer) => {
      // Read-modify-write against storage rather than state: the burn may be
      // saved in the same tick the component mounted, before state has caught up.
      commit(upsertTransfer(readTransfers(address), transfer));
    },
    [address, commit],
  );

  const patch = useCallback(
    (burnTxHash: Hex, changes: Partial<PendingTransfer>) => {
      const current = readTransfers(address);
      const found = current.find((t) => t.burnTxHash.toLowerCase() === burnTxHash.toLowerCase());
      if (!found) return;
      commit(upsertTransfer(current, { ...found, ...changes }));
    },
    [address, commit],
  );

  const drop = useCallback(
    (burnTxHash: Hex) => {
      commit(removeTransfer(readTransfers(address), burnTxHash));
    },
    [address, commit],
  );

  return {
    transfers,
    active: activeTransfer(transfers),
    justMinted: recentlyMinted(transfers),
    canPersist,
    save,
    patch,
    drop,
  };
}
