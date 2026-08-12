import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { avalancheFuji, mainnet, base, arbitrum, polygon } from "wagmi/chains";

const projectId = (import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] as string | undefined) ?? "";

export const chains = [avalancheFuji, mainnet, base, arbitrum, polygon] as const;
export const defaultChain = avalancheFuji;

/**
 * WalletConnect requires a Cloud projectId. When VITE_WALLETCONNECT_PROJECT_ID
 * is missing we fall back to a browser-extension-only config so the app still
 * runs locally instead of crashing at import time.
 */
export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: "Balcore",
      projectId,
      chains,
      ssr: false,
    })
  : createConfig({
      chains,
      connectors: [injected(), coinbaseWallet({ appName: "Balcore" })],
      transports: {
        [avalancheFuji.id]: http(),
        [mainnet.id]: http(),
        [base.id]: http(),
        [arbitrum.id]: http(),
        [polygon.id]: http(),
      },
      ssr: false,
    });

export const hasWalletConnect = Boolean(projectId);
