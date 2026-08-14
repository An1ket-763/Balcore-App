export type TokenSymbol = "USDC" | "BTC" | "ETH" | "AVAX" | "TSLA" | "GOLD";

export interface TokenMeta {
  name: string;
  usd: number;
}

// Mock data — replace with a real price feed later.
export function getTokenPrices(): Record<TokenSymbol, TokenMeta> {
  return {
    USDC: { name: "USD Coin", usd: 1 },
    BTC: { name: "Bitcoin", usd: 63200 },
    ETH: { name: "Ethereum", usd: 3200 },
    AVAX: { name: "Avalanche", usd: 38 },
    TSLA: { name: "Tesla", usd: 330 },
    GOLD: { name: "Gold", usd: 2400 },
  };
}
