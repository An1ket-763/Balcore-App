/**
 * DEX-aggregator quote + calldata clients (KyberSwap and Odos), Avalanche C-Chain.
 *
 * Both are called straight from the browser — they are public, keyless,
 * CORS-open endpoints, and neither request carries anything private beyond the
 * connected address, which is public on-chain anyway.
 *
 * Every function here is written to fail soft: a route that errors returns a
 * message the panel can show in its own tile, so one dead aggregator never
 * takes the swap UI down with it.
 *
 * KyberSwap: https://docs.kyberswap.com/developer-guide/aggregator-api
 * Odos:      https://docs.odos.xyz/build/api-docs
 */

import type { Address, Hex } from "viem";

export const AVALANCHE_CHAIN_ID = 43114;

/** Kyber's native-token sentinel. Odos uses the zero address instead. */
export const KYBER_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
export const ODOS_NATIVE = "0x0000000000000000000000000000000000000000" as const;

/**
 * Odos Router V2 on Avalanche. Used as the approval spender so the allowance
 * can be checked before a path is assembled. `assembleOdosTx` asserts the
 * assembled `to` matches this — see the note there.
 */
export const ODOS_ROUTER_V2 = "0x88de50B233052e4Fb783d4F6db78Cc34fEa3e9FC" as const;

const KYBER_BASE = "https://aggregator-api.kyberswap.com/avalanche/api/v1";
const ODOS_BASE = "https://api.odos.xyz";

/** Identifies this app to KyberSwap; also used as the Kyber `source` tag. */
const CLIENT_ID = "balcore";

const REQUEST_TIMEOUT_MS = 12_000;

export interface AggregatorTx {
  to: Address;
  data: Hex;
  value: bigint;
  /** Aggregator-suggested gas limit, when it provides one. */
  gas?: bigint;
}

/** An aggregator said no in a way worth showing the user verbatim-ish. */
export class AggregatorError extends Error {
  constructor(
    public readonly source: "KyberSwap" | "Odos",
    message: string,
  ) {
    super(message);
    this.name = "AggregatorError";
  }
}

/**
 * fetch + timeout, honouring any caller-supplied abort signal.
 *
 * `signal` is a separate parameter rather than a field on `init` because
 * RequestInit types it as `AbortSignal | null`, which an optional
 * `AbortSignal | undefined` can't satisfy under exactOptionalPropertyTypes.
 */
async function requestJson<T>(
  url: string,
  init: Omit<RequestInit, "signal">,
  source: "KyberSwap" | "Odos",
  signal?: AbortSignal | undefined,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(url, { ...init, signal: timeout.signal });
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!res.ok) {
      throw new AggregatorError(
        source,
        extractMessage(payload) ?? `${source} returned ${res.status}`,
      );
    }
    return payload as T;
  } catch (e) {
    if (e instanceof AggregatorError) throw e;
    if (signal?.aborted) throw e; // caller cancelled — let react-query swallow it
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new AggregatorError(source, `${source} timed out`);
    }
    throw new AggregatorError(source, `${source} unreachable`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const msg = obj["message"] ?? obj["detail"] ?? obj["error"];
  return typeof msg === "string" && msg.trim() ? msg.trim() : null;
}

/* ------------------------------------------------------------------ */
/* KyberSwap                                                           */
/* ------------------------------------------------------------------ */

/**
 * Kyber's routeSummary is an opaque blob that must be handed back to
 * /route/build byte-for-byte, so it is deliberately not modelled field by
 * field — only the parts the UI reads are typed.
 */
export interface KyberRouteSummary {
  tokenIn: string;
  amountIn: string;
  tokenOut: string;
  amountOut: string;
  gas?: string;
  gasUsd?: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  [key: string]: unknown;
}

export interface KyberQuote {
  amountOut: bigint;
  gasUsd: number | null;
  /** Derived from the USD in/out values Kyber returns; null when it omits them. */
  priceImpactPct: number | null;
  routerAddress: Address;
  routeSummary: KyberRouteSummary;
}

export async function fetchKyberQuote(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  signal?: AbortSignal | undefined;
}): Promise<KyberQuote> {
  const query = new URLSearchParams({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn.toString(),
    gasInclude: "true",
  });

  const body = await requestJson<{
    code?: number;
    message?: string;
    data?: { routeSummary?: KyberRouteSummary; routerAddress?: string };
  }>(
    `${KYBER_BASE}/routes?${query.toString()}`,
    { method: "GET", headers: { "x-client-id": CLIENT_ID } },
    "KyberSwap",
    params.signal,
  );

  const summary = body?.data?.routeSummary;
  const router = body?.data?.routerAddress;
  if (!summary || !router) {
    throw new AggregatorError("KyberSwap", body?.message || "No KyberSwap route");
  }
  const amountOut = safeBigInt(summary.amountOut);
  if (amountOut <= 0n) throw new AggregatorError("KyberSwap", "No KyberSwap liquidity");

  return {
    amountOut,
    gasUsd: safeNumber(summary.gasUsd),
    priceImpactPct: impactFromUsd(
      safeNumber(summary.amountInUsd),
      safeNumber(summary.amountOutUsd),
    ),
    routerAddress: router as Address,
    routeSummary: summary,
  };
}

export async function buildKyberTx(params: {
  routeSummary: KyberRouteSummary;
  routerAddress: Address;
  sender: Address;
  recipient: Address;
  /** Max slippage in basis points, e.g. 50 for 0.5%. */
  slippageBps: number;
  deadline: bigint;
  /** Set when the input token is native AVAX — Kyber expects it as tx value. */
  nativeValue: bigint;
  signal?: AbortSignal | undefined;
}): Promise<AggregatorTx> {
  const body = await requestJson<{
    code?: number;
    message?: string;
    data?: { data?: string; routerAddress?: string; gas?: string };
  }>(
    `${KYBER_BASE}/route/build`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": CLIENT_ID },
      body: JSON.stringify({
        routeSummary: params.routeSummary,
        sender: params.sender,
        recipient: params.recipient,
        slippageTolerance: Math.round(params.slippageBps),
        deadline: Number(params.deadline),
        source: CLIENT_ID,
      }),
    },
    "KyberSwap",
    params.signal,
  );

  const data = body?.data?.data;
  if (!data)
    throw new AggregatorError("KyberSwap", body?.message || "KyberSwap could not build the swap");

  // Kyber echoes the router back; prefer the echo but never accept a blank.
  const to = (body?.data?.routerAddress ?? params.routerAddress) as Address;

  return {
    to,
    data: data as Hex,
    value: params.nativeValue,
    ...(body?.data?.gas ? { gas: safeBigInt(body.data.gas) } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Odos                                                                */
/* ------------------------------------------------------------------ */

export interface OdosQuote {
  amountOut: bigint;
  pathId: string;
  gasEstimate: number | null;
  /** Derived from the USD in/out values Odos returns; null when it omits them. */
  priceImpactPct: number | null;
}

export async function fetchOdosQuote(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  userAddr: Address;
  /** Max slippage as a percent, e.g. 0.5. */
  slippagePct: number;
  signal?: AbortSignal | undefined;
}): Promise<OdosQuote> {
  const body = await requestJson<{
    pathId?: string;
    outAmounts?: string[];
    inValues?: number[];
    outValues?: number[];
    gasEstimate?: number;
    detail?: string;
  }>(
    `${ODOS_BASE}/sor/quote/v2`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: AVALANCHE_CHAIN_ID,
        inputTokens: [{ tokenAddress: params.tokenIn, amount: params.amountIn.toString() }],
        outputTokens: [{ tokenAddress: params.tokenOut, proportion: 1 }],
        userAddr: params.userAddr,
        slippageLimitPercent: params.slippagePct,
        referralCode: 0,
        disableRFQs: true,
        compact: true,
      }),
    },
    "Odos",
    params.signal,
  );

  const pathId = body?.pathId;
  const out = body?.outAmounts?.[0];
  if (!pathId || !out) throw new AggregatorError("Odos", body?.detail || "No Odos route");
  const amountOut = safeBigInt(out);
  if (amountOut <= 0n) throw new AggregatorError("Odos", "No Odos liquidity");

  return {
    amountOut,
    pathId,
    gasEstimate: safeNumber(body?.gasEstimate),
    priceImpactPct: impactFromUsd(
      safeNumber(body?.inValues?.[0]),
      safeNumber(body?.outValues?.[0]),
    ),
  };
}

export async function assembleOdosTx(params: {
  pathId: string;
  userAddr: Address;
  signal?: AbortSignal | undefined;
}): Promise<AggregatorTx> {
  const body = await requestJson<{
    detail?: string;
    transaction?: { to?: string; data?: string; value?: string | number; gas?: string | number };
  }>(
    `${ODOS_BASE}/sor/assemble`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddr: params.userAddr, pathId: params.pathId, simulate: false }),
    },
    "Odos",
    params.signal,
  );

  const tx = body?.transaction;
  if (!tx?.to || !tx?.data)
    throw new AggregatorError("Odos", body?.detail || "Odos could not build the swap");

  // Guard rail: we approve USDC to ODOS_ROUTER_V2 before this call, so if Odos
  // ever hands back a different target (a new router deployment, a hijacked
  // response) we refuse rather than sign a transaction against an address the
  // user never approved. Bump ODOS_ROUTER_V2 when Odos genuinely redeploys.
  if (tx.to.toLowerCase() !== (ODOS_ROUTER_V2 as string).toLowerCase()) {
    throw new AggregatorError("Odos", "Odos returned an unexpected router — swap blocked");
  }

  return {
    to: tx.to as Address,
    data: tx.data as Hex,
    value: safeBigInt(tx.value),
    ...(tx.gas ? { gas: safeBigInt(tx.gas) } : {}),
  };
}

/* ------------------------------------------------------------------ */

function safeBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/**
 * Price impact from the USD value in vs out. Both aggregators report these, but
 * neither guarantees them, so a missing or nonsensical pair yields null rather
 * than a made-up number.
 */
function impactFromUsd(inUsd: number | null, outUsd: number | null): number | null {
  if (inUsd === null || outUsd === null || inUsd <= 0 || outUsd <= 0) return null;
  const impact = ((inUsd - outUsd) / inUsd) * 100;
  if (!Number.isFinite(impact)) return null;
  return impact > 0 ? impact : 0;
}

function safeNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}
