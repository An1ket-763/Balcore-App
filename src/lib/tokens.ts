/**
 * Curated swap tokens on Avalanche C-Chain.
 *
 * Addresses are taken verbatim from LFJ's (Trader Joe's) official token list
 * — https://github.com/traderjoe-xyz/joe-tokenlists — and deliberately NOT
 * from memory: a wrong address here spends real funds into the wrong contract.
 * Keep this list short and liquid. Anything added here must have a pool the
 * routers can actually fill against, or every tile shows a dash.
 *
 * "ETH" and "BTC" on Avalanche are bridged representations (WETH.e and BTC.b
 * from the Avalanche Bridge), not the native assets on their own chains.
 * Reaching those needs a bridge, not a swap.
 */

import type { Address } from "viem";
import { WAVAX_ADDRESS } from "./lfjSwap";
import { KYBER_NATIVE, ODOS_NATIVE } from "./aggregatorApi";
import type { TokenSymbol } from "@/features/ui-preview/dashboard/data/prices";
import { USDC_ADDRESS } from "@/features/ui-preview/dashboard/data/balances";

export interface SwapToken {
  /** Ticker shown in the picker. */
  symbol: string;
  /** Longer label shown under the ticker in the dropdown. */
  label: string;
  /**
   * ERC-20 contract used for routing. For native AVAX this is WAVAX, which is
   * what the DEX routers actually price against; `native` below is what tells
   * the executor to send value / unwrap rather than move an ERC-20.
   */
  address: Address;
  decimals: number;
  /** True only for the chain's native coin (AVAX). */
  native: boolean;
  /** Existing coin-badge class in dashboard.css. */
  coinClass: string;
  /** Glyph inside the coin badge. */
  badge: string;
  /**
   * Key into the (still mock) price table, used for the USD balance label and
   * the "rate looks wrong" sanity check. Omitted where no honest reference
   * exists — sAVAX is worth more than AVAX, so pricing it as AVAX would make
   * the sanity check lie.
   */
  priceKey?: TokenSymbol;
}

export const AVAX: SwapToken = {
  symbol: "AVAX",
  label: "Avalanche",
  address: WAVAX_ADDRESS as Address,
  decimals: 18,
  native: true,
  coinClass: "c-avax",
  badge: "A",
  priceKey: "AVAX",
};

export const USDC: SwapToken = {
  symbol: "USDC",
  label: "USD Coin",
  // Reused from balances.ts so there is exactly one USDC address in the app.
  address: USDC_ADDRESS,
  decimals: 6,
  native: false,
  coinClass: "c-usd",
  badge: "$",
  priceKey: "USDC",
};

export const SWAP_TOKENS: readonly SwapToken[] = [
  AVAX,
  USDC,
  {
    symbol: "USDT",
    label: "Tether (native)",
    address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    decimals: 6,
    native: false,
    coinClass: "c-usdt",
    badge: "₮",
    // Both are dollar stablecoins, so USDC is an honest reference for USDT.
    priceKey: "USDC",
  },
  {
    symbol: "WETH.e",
    label: "Ether (Avalanche Bridge)",
    address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
    decimals: 18,
    native: false,
    coinClass: "c-eth",
    badge: "Ξ",
    priceKey: "ETH",
  },
  {
    symbol: "BTC.b",
    label: "Bitcoin (Avalanche Bridge)",
    address: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
    decimals: 8,
    native: false,
    coinClass: "c-btc",
    badge: "₿",
    priceKey: "BTC",
  },
  {
    symbol: "sAVAX",
    label: "Benqi Staked AVAX",
    address: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
    decimals: 18,
    native: false,
    coinClass: "c-savax",
    badge: "sA",
  },
];

export function tokenBySymbol(symbol: string): SwapToken {
  return SWAP_TOKENS.find((t) => t.symbol === symbol) ?? AVAX;
}

export function sameToken(a: SwapToken, b: SwapToken) {
  return a.symbol === b.symbol;
}

/** KyberSwap wants its own sentinel for the native coin. */
export function kyberAddress(token: SwapToken): string {
  return token.native ? KYBER_NATIVE : token.address;
}

/** Odos uses the zero address for the native coin instead. */
export function odosAddress(token: SwapToken): string {
  return token.native ? ODOS_NATIVE : token.address;
}

/**
 * Intermediate hops to try when no direct pair is likely. WAVAX is the base
 * asset for nearly every Avalanche pool; USDC covers the stable-to-stable and
 * stable-to-major cases where the WAVAX hop would be the long way round.
 */
export const HOP_TOKENS: readonly Address[] = [WAVAX_ADDRESS as Address, USDC.address];

/**
 * Format an amount for display. Stablecoins read better at 2 decimals; volatile
 * assets need more, and something like BTC.b would round to nothing at 2.
 */
export function formatTokenAmount(token: SwapToken, n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const maximumFractionDigits = n >= 1000 ? 2 : token.decimals <= 6 ? 4 : n >= 1 ? 6 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits });
}
