/**
 * Circle Iris REST client — the off-chain half of CCTP.
 *
 * Public, keyless and CORS-open, so it is called straight from the browser like
 * the DEX aggregators. Nothing private goes over it: the burn transaction hash
 * and the connected address are both public on-chain data.
 *
 * Docs: https://developers.circle.com/api-reference/cctp/all/get-burn-usdc-fees
 */

import { FINALITY, feeUrl, type TransferSpeed } from "./cctp";

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
