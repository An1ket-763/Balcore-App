import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { avalancheFuji, mainnet, base, arbitrum, polygon } from "wagmi/chains";

/**
 * WalletConnect project id — set VITE_WALLETCONNECT_PROJECT_ID in your env.
 * See .env.example. Never hardcode the real id here.
 */
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

export const wagmiConfig = getDefaultConfig({
  appName: "Balcore",
  projectId,
  // Avalanche Fuji is the primary/default chain.
  // Ethereum / Base / Arbitrum / Polygon are here for the upcoming USDC bridge.
  chains: [avalancheFuji, mainnet, base, arbitrum, polygon],
  ssr: true,
});

export const defaultChain = avalancheFuji;
