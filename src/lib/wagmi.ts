import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  mainnet,
  polygon,
  polygonAmoy,
  sepolia,
} from "wagmi/chains";

const projectId = (import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] as string | undefined) ?? "";

/**
 * Network selection. "mainnet" is the default; this app is intended for
 * Avalanche C-Chain mainnet. Set VITE_CHAIN_ENV=testnet to opt into Fuji
 * for local development only.
 */
const chainEnv = (
  (import.meta.env["VITE_CHAIN_ENV"] as string | undefined) ?? "mainnet"
).toLowerCase();

export const isMainnet = chainEnv === "mainnet";

/** Primary Avalanche chain for this environment. */
export const defaultChain = isMainnet ? avalanche : avalancheFuji;

/**
 * Chains wagmi is allowed to talk to. This list MUST cover every chainId in
 * `BRIDGE_CHAINS` for the selected environment: `usePublicClient({ chainId })`
 * returns undefined for an unregistered chain, and `switchChain` refuses it —
 * so a missing entry silently kills the destination balance read, the claim,
 * and the chain switch, with no error the user can act on.
 *
 * Testnet therefore registers the TESTNET counterparts (Sepolia, Base Sepolia,
 * Arbitrum Sepolia, Amoy), not the mainnets. Both Avalanche chains stay
 * available in each environment; the selected one comes first (connection
 * priority) and drives the wrong-network banner.
 */
const mainnetFirst = [avalanche, avalancheFuji, mainnet, base, arbitrum, polygon] as const;
const testnetFirst = [
  avalancheFuji,
  avalanche,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  polygonAmoy,
] as const;
export const chains: typeof mainnetFirst | typeof testnetFirst = isMainnet
  ? mainnetFirst
  : testnetFirst;

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
      // Keyed by every chain either environment can register, so this map can
      // never drift behind the two lists above.
      transports: {
        [avalanche.id]: http(),
        [avalancheFuji.id]: http(),
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [base.id]: http(),
        [baseSepolia.id]: http(),
        [arbitrum.id]: http(),
        [arbitrumSepolia.id]: http(),
        [polygon.id]: http(),
        [polygonAmoy.id]: http(),
      },
      ssr: false,
    });

export const hasWalletConnect = Boolean(projectId);
