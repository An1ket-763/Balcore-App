import { useEffect, useMemo } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { avalancheFuji } from "wagmi/chains";
import type { TokenSymbol } from "./prices";

/**
 * Circle's official testnet USDC on Avalanche Fuji.
 * https://developers.circle.com/stablecoins/usdc-on-test-networks
 */
export const FUJI_USDC_ADDRESS = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;

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

/** Assets that aren't real tokens on Fuji — still mocked for now. */
const MOCK_BALANCES = {
  BTC: 0.34,
  ETH: 2.1,
  TSLA: 12,
  GOLD: 3.5,
} as const;

export type TokenBalances = Record<TokenSymbol, number>;

const FALLBACK: TokenBalances = { USDC: 0, AVAX: 0, ...MOCK_BALANCES };

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
    chainId: avalancheFuji.id,
    query: { enabled },
  });

  const usdcRaw = useReadContract({
    abi: erc20Abi,
    address: FUJI_USDC_ADDRESS,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: avalancheFuji.id,
    query: { enabled },
  });

  const usdcDecimals = useReadContract({
    abi: erc20Abi,
    address: FUJI_USDC_ADDRESS,
    functionName: "decimals",
    chainId: avalancheFuji.id,
    query: { enabled },
  });

  const isLoading =
    enabled && (native.isLoading || usdcRaw.isLoading || usdcDecimals.isLoading);

  const balances = useMemo<TokenBalances>(() => {
    let avax = 0;
    let usdc = 0;
    try {
      if (native.data) avax = Number(formatUnits(native.data.value, native.data.decimals));
      if (typeof usdcRaw.data === "bigint") {
        const dec = typeof usdcDecimals.data === "number" ? usdcDecimals.data : 6;
        usdc = Number(formatUnits(usdcRaw.data, dec));
      }
    } catch {
      // A failed/malformed read falls back to 0 rather than crashing the view.
    }
    if (!Number.isFinite(avax)) avax = 0;
    if (!Number.isFinite(usdc)) usdc = 0;
    return { USDC: usdc, AVAX: avax, ...MOCK_BALANCES };
  }, [native.data, usdcRaw.data, usdcDecimals.data]);

  useEffect(() => {
    snapshot = balances;
  }, [balances]);

  return { balances, isLoading };
}
