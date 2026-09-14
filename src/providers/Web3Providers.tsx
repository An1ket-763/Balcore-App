import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import type { ReactNode } from "react";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { pickActiveWallet, privyAppId, privyConfig } from "@/lib/privy";

/**
 * Provider order is required by Privy: PrivyProvider > QueryClientProvider >
 * WagmiProvider (the Privy-aware one from @privy-io/wagmi, not wagmi's own).
 */
export default function Web3Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!privyAppId) return <MissingPrivyAppId />;

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={pickActiveWallet}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

/** Shown instead of a crash when the Privy app ID is not configured. */
function MissingPrivyAppId() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#07070f",
        color: "#eceaf6",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Sign-in isn’t configured</h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "#a7a4bd", margin: 0 }}>
          Set <code>VITE_PRIVY_APP_ID</code> to your Privy app ID (from dashboard.privy.io) in the
          environment, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
