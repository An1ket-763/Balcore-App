import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import Web3Providers from "@/providers/Web3Providers";
import DashboardApp from "@/features/ui-preview/dashboard/DashboardApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Balcore — Market Making Dashboard" },
      {
        name: "description",
        content:
          "Connect your wallet to Balcore: provide liquidity, earn fees, and track your market-making positions on Avalanche.",
      },
      { property: "og:title", content: "Balcore — Market Making Dashboard" },
      {
        property: "og:description",
        content:
          "Connect your wallet to Balcore: provide liquidity, earn fees, and track your market-making positions on Avalanche.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
  ssr: false,
});

function Index() {
  return (
    <ClientOnly fallback={<div style={{ minHeight: "100vh" }} />}>
      <Web3Providers>
        <DashboardApp />
      </Web3Providers>
    </ClientOnly>
  );
}
