import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { isMainnet, defaultChain } from "@/lib/wagmi";
import { USDC_ADDRESS } from "./balances";
import {
  AVAX_DECIMALS,
  USDC_DECIMALS,
  LB_QUOTER_ADDRESS,
  WAVAX_ADDRESS,
  lbQuoterAbi,
  type SwapDirection,
} from "@/lib/lfjSwap";

export interface ResolvedPath {
  pairBinSteps: readonly bigint[];
  versions: readonly number[];
  tokenPath: readonly `0x${string}`[];
  pairs: readonly `0x${string}`[];
}

export interface SwapQuote {
  /** Raw output amount in the output token's smallest unit. */
  amountOut: bigint;
  /** Human-readable output amount. */
  amountOutFormatted: number;
  /** Price impact in percent, derived from the quoter's virtual amounts. */
  priceImpactPct: number;
  /** Router Path struct resolved by the quoter (bin steps are NOT guessed). */
  path: ResolvedPath;
}

export function decimalsFor(sym: "AVAX" | "USDC") {
  return sym === "AVAX" ? AVAX_DECIMALS : USDC_DECIMALS;
}

/** Debounce a value so quote reads don't fire on every keystroke. */
function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Live LFJ Liquidity Book quote for native AVAX <-> USDC.
 * Only active when the app is pointed at Avalanche mainnet.
 */
export function useSwapQuote(direction: SwapDirection, amountIn: string) {
  const debouncedAmount = useDebounced(amountIn);
  const isAvaxIn = direction === "AVAX_TO_USDC";
  const inDecimals = isAvaxIn ? AVAX_DECIMALS : USDC_DECIMALS;
  const outDecimals = isAvaxIn ? USDC_DECIMALS : AVAX_DECIMALS;

  const amountInWei = useMemo(() => {
    const clean = (debouncedAmount || "").replace(/,/g, "").trim();
    if (!clean) return 0n;
    try {
      const parsed = parseUnits(clean, inDecimals);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }, [debouncedAmount, inDecimals]);

  const route = useMemo<readonly `0x${string}`[]>(
    () => (isAvaxIn ? [WAVAX_ADDRESS, USDC_ADDRESS] : [USDC_ADDRESS, WAVAX_ADDRESS]),
    [isAvaxIn],
  );

  const enabled = isMainnet && amountInWei > 0n;

  const read = useReadContract({
    abi: lbQuoterAbi,
    address: LB_QUOTER_ADDRESS,
    functionName: "findBestPathFromAmountIn",
    args: [route, amountInWei],
    chainId: defaultChain.id,
    query: { enabled, refetchInterval: enabled ? 15_000 : false },
  });

  const quote = useMemo<SwapQuote | null>(() => {
    const raw = read.data;
    if (!raw) return null;
    const amounts = raw.amounts;
    const virtual = raw.virtualAmountsWithoutSlippage;
    if (!amounts || amounts.length < 2) return null;
    const amountOut = amounts[amounts.length - 1] ?? 0n;
    if (amountOut <= 0n) return null;
    const virtualOut = virtual?.[virtual.length - 1] ?? 0n;
    let priceImpactPct = 0;
    if (virtualOut > 0n) {
      priceImpactPct =
        ((Number(formatUnits(virtualOut, outDecimals)) - Number(formatUnits(amountOut, outDecimals))) /
          Number(formatUnits(virtualOut, outDecimals))) *
        100;
      if (!Number.isFinite(priceImpactPct) || priceImpactPct < 0) priceImpactPct = 0;
    }
    return {
      amountOut,
      amountOutFormatted: Number(formatUnits(amountOut, outDecimals)),
      priceImpactPct,
      path: {
        pairBinSteps: raw.binSteps,
        versions: raw.versions as readonly number[],
        tokenPath: raw.route as readonly `0x${string}`[],
        pairs: raw.pairs as readonly `0x${string}`[],
      },
    };
  }, [read.data, outDecimals]);

  return {
    quote,
    amountInWei,
    isLoading: enabled && read.isLoading,
    isFetching: enabled && read.isFetching,
    error: read.error ?? null,
    /** True while the typed amount hasn't been quoted yet. */
    isStale: amountIn.trim() !== debouncedAmount.trim(),
  };
}
