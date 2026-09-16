import { useEffect, useMemo } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import type { TokenSymbol } from "./prices";
import { defaultChain, isMainnet } from "@/lib/wagmi";

/**
 * Circle-issued native USDC on the selected Avalanche chain.
 * mainnet: native USDC (NOT the older bridged USDC.e)
 * testnet: Circle's official Fuji test USDC
 * https://developers.circle.com/stablecoins/usdc-on-main-networks
 */
export const USDC_ADDRESS = (
  isMainnet ? "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" : "0x5425890298aed601595a70AB815c96711a31Bc65"
) as `0x${string}`;

/** Minimal ERC-20 ABI — only what we need for a balance read. */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/**
 * BTC.b — Bitcoin via the Avalanche Bridge, and the volatile leg of the live
 * pool. Address duplicated from `@/lib/tokens` ("BTC.b") rather than imported,
 * for the same reason `prices.ts` duplicates its feeds: `config/addresses.ts`
 * imports THIS module, so a value import back the other way would close a loop.
 */
export const BTCB_ADDRESS = "0x152b9d0FdC40C096757F570A51E494bd4b943E50" as `0x${string}`;

/**
 * Every symbol here is a token the wallet can actually hold on this chain and
 * that `prices.ts` can actually price.
 *
 * `MOCK_BALANCES` used to live here — BTC 0.34, ETH 2.1, TSLA 12, GOLD 3.5,
 * handed to every user regardless of what they held, under the comment "assets
 * that aren't real tokens on Avalanche". They are gone: ETH, TSLA and GOLD are
 * not held or priced in this deployment, and BTC is now a real BTC.b read.
 */
export type TokenBalances = Record<TokenSymbol, number>;

const FALLBACK: TokenBalances = { USDC: 0, AVAX: 0, BTC: 0 };

/**
 * Live snapshot kept in sync by useTokenBalances(), so the imperative
 * dashboard scripts (which can't use React hooks) can read current values.
 */
let snapshot: TokenBalances = { ...FALLBACK };

/** Non-reactive read used by dashboardScripts.ts. */
export function getTokenBalances(): TokenBalances {
  return { ...snapshot };
}

export function useTokenBalances(): { balances: TokenBalances; isLoading: boolean } {
  const { address, isConnected } = useAccount();
  const enabled = Boolean(address) && isConnected;

  const native = useBalance({
    address,
    chainId: defaultChain.id,
    query: { enabled },
  });

  const usdcRaw = useReadContract({
    abi: erc20Abi,
    address: USDC_ADDRESS,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: defaultChain.id,
    query: { enabled },
  });

  const usdcDecimals = useReadContract({
    abi: erc20Abi,
    address: USDC_ADDRESS,
    functionName: "decimals",
    chainId: defaultChain.id,
    query: { enabled },
  });

  const btcbRaw = useReadContract({
    abi: erc20Abi,
    address: BTCB_ADDRESS,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: defaultChain.id,
    query: { enabled },
  });

  const btcbDecimals = useReadContract({
    abi: erc20Abi,
    address: BTCB_ADDRESS,
    functionName: "decimals",
    chainId: defaultChain.id,
    query: { enabled },
  });

  const isLoading =
    enabled &&
    (native.isLoading ||
      usdcRaw.isLoading ||
      usdcDecimals.isLoading ||
      btcbRaw.isLoading ||
      btcbDecimals.isLoading);

  const balances = useMemo<TokenBalances>(() => {
    let avax = 0;
    let usdc = 0;
    let btc = 0;
    try {
      if (native.data) avax = Number(formatUnits(native.data.value, native.data.decimals));
      if (typeof usdcRaw.data === "bigint") {
        const dec = typeof usdcDecimals.data === "number" ? usdcDecimals.data : 6;
        usdc = Number(formatUnits(usdcRaw.data, dec));
      }
      if (typeof btcbRaw.data === "bigint") {
        // BTC.b is 8-decimal; the read is authoritative, the literal is a floor.
        const dec = typeof btcbDecimals.data === "number" ? btcbDecimals.data : 8;
        btc = Number(formatUnits(btcbRaw.data, dec));
      }
    } catch {
      // A failed/malformed read falls back to 0 rather than crashing the view.
    }
    if (!Number.isFinite(avax)) avax = 0;
    if (!Number.isFinite(usdc)) usdc = 0;
    if (!Number.isFinite(btc)) btc = 0;
    return { USDC: usdc, AVAX: avax, BTC: btc };
  }, [native.data, usdcRaw.data, usdcDecimals.data, btcbRaw.data, btcbDecimals.data]);

  useEffect(() => {
    snapshot = balances;
  }, [balances]);

  return { balances, isLoading };
}
