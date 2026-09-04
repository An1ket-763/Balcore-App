/**
 * Circle Iris REST client — the off-chain half of CCTP.
 *
 * Public, keyless and CORS-open, so it is called straight from the browser like
 * the DEX aggregators. Nothing private goes over it: the burn transaction hash
 * and the connected address are both public on-chain data.
 *
 * Docs: https://developers.circle.com/api-reference/cctp/all/get-burn-usdc-fees
 */

import type { Hex } from "viem";
import { FINALITY, attestationUrl, feeUrl, type TransferSpeed } from "./cctp";

const REQUEST_TIMEOUT_MS = 12_000;

/** Circle said no, or said something we could not parse. */
export class CctpApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CctpApiError";
  }
}

async function requestJson<T>(url: string, signal?: AbortSignal | undefined): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new CctpApiError(`Circle returned ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof CctpApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CctpApiError("Circle fee lookup timed out");
    }
    throw new CctpApiError("Circle fee lookup unreachable");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * One row of Circle's fee table. The API returns one per finality threshold,
 * e.g. Ethereum -> Avalanche gives
 *   [{ finalityThreshold: 1000, minimumFee: 1 }, { finalityThreshold: 2000, minimumFee: 0 }]
 * so Fast costs 1 bp there and Standard is free — which is why the fee is
 * looked up per route rather than assumed.
 */
export interface BurnFeeRow {
  finalityThreshold: number;
  /** Basis points. 1 bp = 0.01%. */
  minimumFee: number;
}

export interface BurnFees {
  /** Fee in basis points for each speed, null when Circle did not quote it. */
  fast: number | null;
  standard: number | null;
}

/**
 * Fees for one route, keyed by speed.
 *
 * A malformed or missing row yields null rather than a guessed number: `maxFee`
 * on the burn is derived from this, and inventing a value there either reverts
 * the transaction (too low) or silently authorises an unbounded fee (too high).
 */
export async function fetchBurnFees(
  sourceDomain: number,
  destinationDomain: number,
  signal?: AbortSignal | undefined,
): Promise<BurnFees> {
  const rows = await requestJson<BurnFeeRow[]>(feeUrl(sourceDomain, destinationDomain), signal);
  if (!Array.isArray(rows)) throw new CctpApiError("Unexpected fee response from Circle");

  const bpsFor = (threshold: number): number | null => {
    const row = rows.find((r) => Number(r?.finalityThreshold) === threshold);
    const bps = Number(row?.minimumFee);
    return Number.isFinite(bps) && bps >= 0 ? bps : null;
  };

  return {
    fast: bpsFor(FINALITY.fast),
    standard: bpsFor(FINALITY.standard),
  };
}

/** Pick the basis-point rate that applies to the chosen speed. */
export function bpsForSpeed(fees: BurnFees | undefined, speed: TransferSpeed): number | null {
  if (!fees) return null;
  return speed === "fast" ? fees.fast : fees.standard;
}

/* ------------------------------------------------------------------ */
/* Attestations                                                        */
/* ------------------------------------------------------------------ */

/** Iris reports one of these per message. Only `complete` can be minted. */
export type AttestationStatus = "complete" | "pending_confirmations";

export interface Attestation {
  status: AttestationStatus;
  /** The CCTP message bytes. Needed verbatim by receiveMessage. */
  message: Hex | null;
  /** Circle's signature over the message. Null until status is complete. */
  attestation: Hex | null;
  eventNonce: string | null;
}

interface IrisMessage {
  message?: string;
  attestation?: string | null;
  status?: string;
  eventNonce?: string;
  cctpVersion?: number;
}

const isHex = (v: unknown): v is Hex =>
  typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v) && v.length > 2;

/**
 * Circle's signed proof that a burn happened, looked up by its transaction.
 *
 * Returns null while Iris has not indexed the burn yet — a burn that has only
 * just been mined is legitimately absent for a few seconds, which is different
 * from an error and must not be shown to the user as one.
 *
 * The V1 API used the literal string "PENDING" in the attestation field; V2
 * uses null. Anything that is not real hex is treated as "not signed yet"
 * rather than passed on to a contract call that would revert.
 */
export async function fetchAttestation(
  sourceDomain: number,
  burnTxHash: Hex,
  signal?: AbortSignal | undefined,
): Promise<Attestation | null> {
  let payload: { messages?: IrisMessage[] };
  try {
    payload = await requestJson<{ messages?: IrisMessage[] }>(
      attestationUrl(sourceDomain, burnTxHash),
      signal,
    );
  } catch (error) {
    // Iris answers 404 until it has seen the burn. That is "not yet", not a
    // failure, and retrying is exactly the right thing to do.
    if (error instanceof CctpApiError && /404/.test(error.message)) return null;
    throw error;
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  // Ignore any V1 rows: their message format is not accepted by the V2
  // MessageTransmitter, so minting one would revert.
  const row = messages.find((m) => m?.cctpVersion === undefined || Number(m.cctpVersion) === 2);
  if (!row) return null;

  const complete = row.status === "complete" && isHex(row.attestation);
  return {
    status: complete ? "complete" : "pending_confirmations",
    message: isHex(row.message) ? row.message : null,
    attestation: complete && isHex(row.attestation) ? row.attestation : null,
    eventNonce: typeof row.eventNonce === "string" ? row.eventNonce : null,
  };
}
