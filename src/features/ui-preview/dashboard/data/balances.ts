import type { TokenSymbol } from "./prices";

// Mock data — replace with real on-chain balance reads later.
export function getTokenBalances(): Record<TokenSymbol, number> {
  return {
    USDC: 14200,
    BTC: 0.34,
    ETH: 2.1,
    AVAX: 640,
    TSLA: 12,
    GOLD: 3.5,
  };
}
