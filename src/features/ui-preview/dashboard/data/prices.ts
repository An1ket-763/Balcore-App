/**
 * Token prices, from Chainlink.
 *
 * WAS a hardcoded table — BTC $63,200, AVAX $38, TSLA $330, GOLD $2,400 —
 * carrying the note "replace with a real price feed later". Every wallet value
 * on the dashboard was computed from it, so the wallet column was inventing
 * dollar amounts while the pool column beside it read the chain.
 *
 * THE SYMBOL LIST SHRANK, deliberately. ETH, TSLA and GOLD are gone: there is
 * no Chainlink feed for them in this deployment, and `balances.ts` described
 * TSLA and GOLD as "assets that aren't real tokens on Avalanche" while handing
 * out fixed quantities of them. A token we can neither hold nor price does not
 * belong in a wallet total.
 *
 * `usd` is `number | null` on purpose. null means "the feed has not answered",
 * which callers must render as a placeholder — the old shape had no way to say
 * that, so an unavailable price silently became a number.
 *
 * DEPENDENCY NOTE: this module is a leaf. `tokens.ts` and `balances.ts` both
 * import `TokenSymbol` from here, and `balcore/config/addresses.ts` imports
 * from both of those — so this file must NOT import the pool config, and the
 * two feed addresses below are duplicated from it instead. They are immutable
 * public oracles; if they ever change, `config/addresses.ts` (runsheet §7
 * L829/L831) is the source of truth and these must be updated to match.
 */

import { useEffect, useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { chainlinkFeedAbi } from "@/lib/balcore/abi/feed";
import { defaultChain, isMainnet } from "@/lib/wagmi";

/** Only what this deployment can actually hold AND price. */
export type TokenSymbol = "USDC" | "BTC" | "AVAX";

export interface TokenMeta {
  name: string;
  /** USD price, or null when the feed has not answered. Never a stand-in. */
  usd: number | null;
}

export type TokenPrices = Record<TokenSymbol, TokenMeta>;

/** Chainlink USD feeds are 8-decimal across the board. */
const FEED_DECIMALS = 8;

/** Mirrors `BTC_POOL.feed` / `AVAX_POOL.feed` — see the dependency note above. */
const BTC_USD_FEED = "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743" as Address;
const AVAX_USD_FEED = "0x0A77230d17318075983913bC2145DB16C7366156" as Address;

const NAMES: Record<TokenSymbol, string> = {
  USDC: "USD Coin",
  BTC: "Bitcoin",
  AVAX: "Avalanche",
};

/**
 * USDC is the unit of account everywhere in this app — the bank denominates
 * positions in it and every figure on screen is already "in dollars". Pricing
 * it at 1 is the accounting convention, not a guess at the market.
 */
const USDC_USD = 1;

const EMPTY: TokenPrices = {
  USDC: { name: NAMES.USDC, usd: USDC_USD },
  BTC: { name: NAMES.BTC, usd: null },
  AVAX: { name: NAMES.AVAX, usd: null },
};

/**
 * Live snapshot, kept in sync by `useTokenPrices()` — the same pattern
 * `balances.ts` uses so the imperative dashboard scripts and the .jsx sidebar
 * can read current values without a hook.
 */
let snapshot: TokenPrices = EMPTY;

/** Non-reactive read. Returns nulls until `useTokenPrices()` has answered. */
export function getTokenPrices(): TokenPrices {
  return { ...snapshot };
}

/** Decode one `latestRoundData()` answer; non-positive is treated as no price. */
function answerOf(entry: { status: "success" | "failure"; result?: unknown } | undefined) {
  if (!entry || entry.status !== "success" || !Array.isArray(entry.result)) return null;
  const answer = (entry.result as readonly unknown[])[1];
  if (typeof answer !== "bigint" || answer <= 0n) return null;
  const n = Number(answer) / 10 ** FEED_DECIMALS;
  return Number.isFinite(n) ? n : null;
}

export function useTokenPrices(): { prices: TokenPrices; isLoading: boolean; isError: boolean } {
  // The feeds above are Avalanche C-Chain mainnet oracles. Off mainnet there is
  // nothing at those addresses, so nothing is queried and prices stay null.
  const enabled = isMainnet;

  const reads = useReadContracts({
    contracts: (enabled
      ? [
          { abi: chainlinkFeedAbi, address: BTC_USD_FEED, chainId: defaultChain.id, functionName: "latestRoundData" },
          { abi: chainlinkFeedAbi, address: AVAX_USD_FEED, chainId: defaultChain.id, functionName: "latestRoundData" },
        ]
      : []) as never,
    allowFailure: true,
    query: { enabled },
  });

  const prices = useMemo<TokenPrices>(() => {
    const r = reads.data as
      readonly { status: "success" | "failure"; result?: unknown }[] | undefined;
    return {
      USDC: { name: NAMES.USDC, usd: USDC_USD },
      BTC: { name: NAMES.BTC, usd: answerOf(r?.[0]) },
      AVAX: { name: NAMES.AVAX, usd: answerOf(r?.[1]) },
    };
  }, [reads.data]);

  useEffect(() => {
    snapshot = prices;
  }, [prices]);

  return { prices, isLoading: enabled && reads.isLoading, isError: reads.isError };
}
