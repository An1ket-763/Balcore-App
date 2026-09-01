import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { isMainnet, defaultChain } from "@/lib/wagmi";
import { LB_QUOTER_ADDRESS, LB_ROUTER_ADDRESS, lbQuoterAbi } from "@/lib/lfjSwap";
import {
  PHARAOH_QUOTER_V2,
  PHARAOH_SWAP_ROUTER,
  PHARAOH_TICK_SPACINGS,
  pharaohQuoterAbi,
} from "@/lib/pharaohSwap";
import {
  AggregatorError,
  ODOS_ROUTER_V2,
  fetchKyberQuote,
  fetchOdosQuote,
  type KyberRouteSummary,
} from "@/lib/aggregatorApi";
import { HOP_TOKENS, kyberAddress, odosAddress, sameToken, type SwapToken } from "@/lib/tokens";

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

export interface ResolvedPath {
  pairBinSteps: readonly bigint[];
  versions: readonly number[];
  tokenPath: readonly `0x${string}`[];
  pairs: readonly `0x${string}`[];
}

export type RouteId = "pharaoh" | "kyber" | "odos" | "lfj";

export type RouteStatus = "idle" | "loading" | "ok" | "error";

export interface RouteQuote {
  id: RouteId;
  name: string;
  /** Pharaoh and LFJ are single DEXs; Kyber and Odos route across many. */
  kind: "dex" | "aggregator";
  status: RouteStatus;
  /** Output in the output token's smallest unit. */
  amountOut: bigint | null;
  amountOutFormatted: number | null;
  error: string | null;
  /** One-line description of how this route fills, shown in Details. */
  detail: string | null;
  priceImpactPct: number | null;
  gasUsd: number | null;
  /** Contract that must hold the ERC-20 allowance for this route. */
  spender: Address;
  /** Route-specific payload the executor needs. Exactly one is set. */
  lfjPath?: ResolvedPath;
  pharaohTickSpacing?: number;
  kyber?: { routeSummary: KyberRouteSummary; routerAddress: Address };
  odos?: { pathId: string };
}

/** Display order matches the 2x2 grid in the panel. */
const ROUTE_META: Record<RouteId, { name: string; kind: "dex" | "aggregator"; spender: Address }> =
  {
    pharaoh: { name: "Pharaoh", kind: "dex", spender: PHARAOH_SWAP_ROUTER as Address },
    // Kyber's spender is whatever router the quote comes back with, so the
    // placeholder is only ever read before a quote lands (never for approval).
    kyber: {
      name: "KyberSwap",
      kind: "aggregator",
      spender: "0x0000000000000000000000000000000000000000" as Address,
    },
    odos: { name: "Odos", kind: "aggregator", spender: ODOS_ROUTER_V2 as Address },
    lfj: { name: "LFJ", kind: "dex", spender: LB_ROUTER_ADDRESS as Address },
  };

export const ROUTE_IDS: readonly RouteId[] = ["pharaoh", "kyber", "odos", "lfj"];

/** Debounce a value so quote reads don't fire on every keystroke. */
function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function emptyRoute(id: RouteId, status: RouteStatus, error: string | null = null): RouteQuote {
  const meta = ROUTE_META[id];
  return {
    id,
    name: meta.name,
    kind: meta.kind,
    status,
    amountOut: null,
    amountOutFormatted: null,
    error,
    detail: null,
    priceImpactPct: null,
    gasUsd: null,
    spender: meta.spender,
  };
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof AggregatorError) return error.message;
  if (error instanceof Error && error.message) {
    // RPC errors are novel-length; the tile only has room for a hint.
    return error.message.length > 80 ? fallback : error.message;
  }
  return fallback;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/* ------------------------------------------------------------------ */
/* LFJ — Liquidity Book, on-chain quoter                               */
/* ------------------------------------------------------------------ */

/**
 * LBQuoter prices a token path you hand it, so a direct pair is only one
 * candidate. For pairs with no direct book (BTC.b/USDT, say) we also offer
 * routes hopping through WAVAX and USDC and keep whichever fills best. All
 * candidates go out in the same multicall.
 */
function useLfjQuote(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountInWei: bigint,
  outDecimals: number,
): RouteQuote {
  const routes = useMemo<Address[][]>(() => {
    const a = tokenIn.address;
    const b = tokenOut.address;
    if (eq(a, b)) return [];
    const list: Address[][] = [[a, b]];
    for (const hop of HOP_TOKENS) {
      if (eq(hop, a) || eq(hop, b)) continue;
      list.push([a, hop, b]);
    }
    return list;
  }, [tokenIn, tokenOut]);

  const enabled = isMainnet && amountInWei > 0n && routes.length > 0;

  const contracts = useMemo(
    () =>
      routes.map((route) => ({
        abi: lbQuoterAbi,
        address: LB_QUOTER_ADDRESS,
        functionName: "findBestPathFromAmountIn" as const,
        args: [route, amountInWei] as const,
        chainId: defaultChain.id,
      })),
    [routes, amountInWei],
  );

  const read = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled, refetchInterval: enabled ? 15_000 : false },
  });

  return useMemo<RouteQuote>(() => {
    if (!enabled) return emptyRoute("lfj", "idle");
    if (read.isLoading && !read.data) return emptyRoute("lfj", "loading");
    if (read.error) return emptyRoute("lfj", "error", messageFor(read.error, "LFJ quote failed"));
    if (!read.data) return emptyRoute("lfj", "loading");

    type Quote = {
      route: readonly `0x${string}`[];
      pairs: readonly `0x${string}`[];
      binSteps: readonly bigint[];
      versions: readonly number[];
      amounts: readonly bigint[];
      virtualAmountsWithoutSlippage: readonly bigint[];
    };

    let best: Quote | null = null;
    let bestOut = 0n;
    for (const entry of read.data) {
      if (entry.status !== "success") continue;
      const raw = entry.result as unknown as Quote | undefined;
      const amounts = raw?.amounts;
      if (!raw || !amounts || amounts.length < 2) continue;
      const out = amounts[amounts.length - 1] ?? 0n;
      if (out > bestOut) {
        bestOut = out;
        best = raw;
      }
    }

    if (!best || bestOut <= 0n) return emptyRoute("lfj", "error", "No LFJ liquidity");

    const virtual = best.virtualAmountsWithoutSlippage;
    const virtualOut = virtual?.[virtual.length - 1] ?? 0n;
    let priceImpactPct: number | null = null;
    if (virtualOut > 0n) {
      const ideal = Number(formatUnits(virtualOut, outDecimals));
      const real = Number(formatUnits(bestOut, outDecimals));
      const impact = ((ideal - real) / ideal) * 100;
      priceImpactPct = Number.isFinite(impact) && impact > 0 ? impact : 0;
    }

    const hops = best.route.length - 1;
    const binSteps = best.binSteps.map((b) => String(b)).join(", ");
    const detail =
      (hops > 1 ? `Liquidity Book · ${hops} hops` : "Liquidity Book") +
      (binSteps ? ` · bin step ${binSteps}` : "");

    return {
      ...emptyRoute("lfj", "ok"),
      amountOut: bestOut,
      amountOutFormatted: Number(formatUnits(bestOut, outDecimals)),
      priceImpactPct,
      detail,
      lfjPath: {
        pairBinSteps: best.binSteps,
        versions: best.versions,
        tokenPath: best.route,
        pairs: best.pairs,
      },
    };
  }, [enabled, read.data, read.error, read.isLoading, outDecimals]);
}

/* ------------------------------------------------------------------ */
/* Pharaoh — concentrated liquidity, on-chain quoter                   */
/* ------------------------------------------------------------------ */

/**
 * Single-hop only. Pharaoh's multi-hop path encoding needs a tick spacing per
 * leg, and discovering those would mean quoting every pair of spacings, so a
 * pair with no direct pool reports honestly instead of guessing. The two
 * aggregators cover multi-hop for those pairs.
 */
function usePharaohQuote(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountInWei: bigint,
  outDecimals: number,
): RouteQuote {
  const enabled = isMainnet && amountInWei > 0n && !eq(tokenIn.address, tokenOut.address);

  /**
   * A 1/1000th-size trade, used as the "no price impact" reference rate.
   * Zero when the trade is too small to divide down meaningfully, in which
   * case the impact calculation is skipped rather than faked.
   */
  const probeAmount = amountInWei >= 1000n ? amountInWei / 1000n : 0n;

  // One multicall covers every candidate tick spacing at both sizes; pools that
  // don't exist revert and come back as individual failures rather than sinking
  // the batch. The first half is the real trade, the second the probe.
  const contracts = useMemo(() => {
    const quote = (amountIn: bigint, tickSpacing: number) => ({
      abi: pharaohQuoterAbi,
      address: PHARAOH_QUOTER_V2 as Address,
      functionName: "quoteExactInputSingle" as const,
      args: [
        {
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn,
          tickSpacing,
          sqrtPriceLimitX96: 0n,
        },
      ] as const,
      chainId: defaultChain.id,
    });
    return [
      ...PHARAOH_TICK_SPACINGS.map((ts) => quote(amountInWei, ts)),
      ...(probeAmount > 0n ? PHARAOH_TICK_SPACINGS.map((ts) => quote(probeAmount, ts)) : []),
    ];
  }, [tokenIn.address, tokenOut.address, amountInWei, probeAmount]);

  const read = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled, refetchInterval: enabled ? 15_000 : false },
  });

  return useMemo<RouteQuote>(() => {
    if (!enabled) return emptyRoute("pharaoh", "idle");
    if (read.isLoading && !read.data) return emptyRoute("pharaoh", "loading");
    if (read.error)
      return emptyRoute("pharaoh", "error", messageFor(read.error, "Pharaoh quote failed"));
    if (!read.data) return emptyRoute("pharaoh", "loading");

    const outAt = (i: number): bigint => {
      const entry = read.data?.[i];
      if (!entry || entry.status !== "success") return 0n;
      const result = entry.result as unknown as
        readonly [bigint, bigint, number, bigint] | undefined;
      return result?.[0] ?? 0n;
    };

    const count = PHARAOH_TICK_SPACINGS.length;
    let bestOut = 0n;
    let bestIndex = -1;
    for (let i = 0; i < count; i++) {
      const out = outAt(i);
      if (out > bestOut) {
        bestOut = out;
        bestIndex = i;
      }
    }

    const tickSpacing = bestIndex >= 0 ? (PHARAOH_TICK_SPACINGS[bestIndex] ?? null) : null;
    if (bestOut <= 0n || tickSpacing === null) {
      return emptyRoute("pharaoh", "error", "No direct Pharaoh pool for this pair");
    }

    // Impact = how far the executed rate falls below the rate a negligible
    // trade would get in the same pool. Both legs come from the same multicall,
    // so they price the same block.
    let priceImpactPct: number | null = null;
    const probeOut = probeAmount > 0n ? outAt(count + bestIndex) : 0n;
    if (probeOut > 0n) {
      const referenceRate = Number(probeOut) / Number(probeAmount);
      const executedRate = Number(bestOut) / Number(amountInWei);
      if (referenceRate > 0 && Number.isFinite(executedRate)) {
        const impact = ((referenceRate - executedRate) / referenceRate) * 100;
        priceImpactPct = Number.isFinite(impact) && impact > 0 ? impact : 0;
      }
    }

    return {
      ...emptyRoute("pharaoh", "ok"),
      amountOut: bestOut,
      amountOutFormatted: Number(formatUnits(bestOut, outDecimals)),
      priceImpactPct,
      detail: `Concentrated liquidity · tick spacing ${tickSpacing}`,
      pharaohTickSpacing: tickSpacing,
    };
  }, [enabled, read.data, read.error, read.isLoading, outDecimals, amountInWei, probeAmount]);
}

/* ------------------------------------------------------------------ */
/* KyberSwap — aggregator API                                          */
/* ------------------------------------------------------------------ */

function useKyberQuote(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountInWei: bigint,
  outDecimals: number,
): RouteQuote {
  const addrIn = kyberAddress(tokenIn);
  const addrOut = kyberAddress(tokenOut);
  const enabled = isMainnet && amountInWei > 0n && !eq(addrIn, addrOut);

  const query = useQuery({
    queryKey: ["kyber-quote", addrIn, addrOut, amountInWei.toString()],
    queryFn: ({ signal }) =>
      fetchKyberQuote({ tokenIn: addrIn, tokenOut: addrOut, amountIn: amountInWei, signal }),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    retry: 1,
    staleTime: 10_000,
  });

  return useMemo<RouteQuote>(() => {
    if (!enabled) return emptyRoute("kyber", "idle");
    if (query.isPending) return emptyRoute("kyber", "loading");
    if (query.error || !query.data) {
      return emptyRoute("kyber", "error", messageFor(query.error, "KyberSwap unavailable"));
    }
    const { amountOut, gasUsd, priceImpactPct, routerAddress, routeSummary } = query.data;
    return {
      ...emptyRoute("kyber", "ok"),
      amountOut,
      amountOutFormatted: Number(formatUnits(amountOut, outDecimals)),
      gasUsd,
      priceImpactPct,
      detail: "Aggregated across Avalanche DEXs",
      spender: routerAddress,
      kyber: { routeSummary, routerAddress },
    };
  }, [enabled, query.isPending, query.error, query.data, outDecimals]);
}

/* ------------------------------------------------------------------ */
/* Odos — aggregator API                                               */
/* ------------------------------------------------------------------ */

function useOdosQuote(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountInWei: bigint,
  outDecimals: number,
  userAddr: Address | undefined,
  slippagePct: number,
): RouteQuote {
  const addrIn = odosAddress(tokenIn);
  const addrOut = odosAddress(tokenOut);
  const pairOk = !eq(addrIn, addrOut);
  // Odos prices the path for a specific wallet, so it can only quote once a
  // wallet is connected. The dashboard is behind connect anyway.
  const enabled = isMainnet && amountInWei > 0n && pairOk && Boolean(userAddr);

  const query = useQuery({
    queryKey: ["odos-quote", addrIn, addrOut, amountInWei.toString(), userAddr, slippagePct],
    queryFn: ({ signal }) =>
      fetchOdosQuote({
        tokenIn: addrIn,
        tokenOut: addrOut,
        amountIn: amountInWei,
        userAddr: userAddr as Address,
        slippagePct,
        signal,
      }),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    retry: 1,
    staleTime: 10_000,
  });

  return useMemo<RouteQuote>(() => {
    if (isMainnet && amountInWei > 0n && pairOk && !userAddr) {
      return emptyRoute("odos", "error", "Connect a wallet for an Odos quote");
    }
    if (!enabled) return emptyRoute("odos", "idle");
    if (query.isPending) return emptyRoute("odos", "loading");
    if (query.error || !query.data) {
      return emptyRoute("odos", "error", messageFor(query.error, "Odos unavailable"));
    }
    const { amountOut, pathId, priceImpactPct } = query.data;
    return {
      ...emptyRoute("odos", "ok"),
      amountOut,
      amountOutFormatted: Number(formatUnits(amountOut, outDecimals)),
      priceImpactPct,
      detail: "Aggregated across Avalanche DEXs",
      odos: { pathId },
    };
  }, [
    enabled,
    query.isPending,
    query.error,
    query.data,
    outDecimals,
    userAddr,
    amountInWei,
    pairOk,
  ]);
}

/* ------------------------------------------------------------------ */
/* Public hook                                                         */
/* ------------------------------------------------------------------ */

export interface RouteQuotes {
  /** Always four entries, in display order, whatever their individual status. */
  routes: RouteQuote[];
  byId: Record<RouteId, RouteQuote>;
  /** Highest output among the routes that actually quoted, else null. */
  bestId: RouteId | null;
  amountInWei: bigint;
  /** True while at least one route is still quoting. */
  isQuoting: boolean;
  /** True while the typed amount hasn't reached the quoters yet. */
  isStale: boolean;
  /** True when every route came back empty or failed. */
  allFailed: boolean;
}

/**
 * Quote the same swap across all four routes at once, for any supported pair.
 *
 * Each source is independent: a failing aggregator or a missing pool shows up
 * as one dead tile, never as a dead panel. Comparison is on raw output for the
 * identical input amount, so the winner is genuinely the best fill — gas is
 * reported where the source provides it but is deliberately not netted off,
 * since only the aggregators estimate it.
 */
export function useRouteQuotes(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountIn: string,
  slippagePct: number,
  userAddr: Address | undefined,
): RouteQuotes {
  const debouncedAmount = useDebounced(amountIn);

  const amountInWei = useMemo(() => {
    if (sameToken(tokenIn, tokenOut)) return 0n;
    const clean = (debouncedAmount || "").replace(/,/g, "").trim();
    if (!clean) return 0n;
    try {
      const parsed = parseUnits(clean, tokenIn.decimals);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }, [debouncedAmount, tokenIn, tokenOut]);

  const outDecimals = tokenOut.decimals;

  const pharaoh = usePharaohQuote(tokenIn, tokenOut, amountInWei, outDecimals);
  const kyber = useKyberQuote(tokenIn, tokenOut, amountInWei, outDecimals);
  const odos = useOdosQuote(tokenIn, tokenOut, amountInWei, outDecimals, userAddr, slippagePct);
  const lfj = useLfjQuote(tokenIn, tokenOut, amountInWei, outDecimals);

  return useMemo<RouteQuotes>(() => {
    const routes = [pharaoh, kyber, odos, lfj];
    const byId = { pharaoh, kyber, odos, lfj } as Record<RouteId, RouteQuote>;

    let bestId: RouteId | null = null;
    let bestOut = 0n;
    for (const route of routes) {
      if (route.status === "ok" && route.amountOut !== null && route.amountOut > bestOut) {
        bestOut = route.amountOut;
        bestId = route.id;
      }
    }

    const isQuoting = routes.some((r) => r.status === "loading");
    const allFailed = amountInWei > 0n && !isQuoting && routes.every((r) => r.status !== "ok");

    return {
      routes,
      byId,
      bestId,
      amountInWei,
      isQuoting,
      isStale: amountIn.trim() !== debouncedAmount.trim(),
      allFailed,
    };
  }, [pharaoh, kyber, odos, lfj, amountInWei, amountIn, debouncedAmount]);
}
