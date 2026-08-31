import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { avalanche, avalancheFuji, mainnet, base, arbitrum, polygon } from "wagmi/chains";

const projectId = (import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] as string | undefined) ?? "";

/**
 * Network selection. "mainnet" makes the app interact with real funds; the
 * default is "testnet" so nobody opts in by accident.
 */
const chainEnv = ((import.meta.env["VITE_CHAIN_ENV"] as string | undefined) ?? "testnet").toLowerCase();

export const isMainnet = chainEnv === "mainnet";

/** Primary Avalanche chain for this environment. */
export const defaultChain = isMainnet ? avalanche : avalancheFuji;

/** Both Avalanche chains stay available; the selected one comes first (connection priority). */
export const chains = (
  isMainnet
    ? [avalanche, avalancheFuji, mainnet, base, arbitrum, polygon]
    : [avalancheFuji, avalanche, mainnet, base, arbitrum, polygon]
) as unknown as readonly [typeof avalanche, ...(typeof chains)[number][]];

/** Block-explorer base URL for the selected Avalanche chain. */
export const explorerBase = isMainnet ? "https://snowtrace.io" : "https://testnet.snowtrace.io";

/** Snowtrace Etherscan-compatible API base for the selected chain. */
export const snowtraceApiBase = isMainnet
  ? "https://api.snowtrace.io/api"
  : "https://api-testnet.snowtrace.io/api";

/**
 * WalletConnect requires a Cloud projectId. When VITE_WALLETCONNECT_PROJECT_ID
 * is missing we fall back to a browser-extension-only config so the app still
 * runs locally instead of crashing at import time.
 */
export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: "Balcore",
      projectId,
      chains: chains as never,
      ssr: false,
    })
  : createConfig({
      chains: chains as never,
      connectors: [injected(), coinbaseWallet({ appName: "Balcore" })],
      transports: {
        [avalanche.id]: http(),
        [avalancheFuji.id]: http(),
        [mainnet.id]: http(),
        [base.id]: http(),
        [arbitrum.id]: http(),
        [polygon.id]: http(),
      },
      ssr: false,
    });

export const hasWalletConnect = Boolean(projectId);
