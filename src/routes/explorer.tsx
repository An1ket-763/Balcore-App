import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import ExplorerPage from "@/features/explorer/ExplorerPage";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Balcore Explorer — Proof of Liquidity" },
      {
        name: "description",
        content:
          "Inspect Balcore's liquidity, fees, IL coverage, LP payouts and wallet-level positions — every figure opens its reconstruction path.",
      },
      { property: "og:title", content: "Balcore Explorer — Proof of Liquidity" },
      {
        property: "og:description",
        content:
          "Inspect Balcore's liquidity, fees, IL coverage, LP payouts and wallet-level positions — every figure opens its reconstruction path.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExplorerRoute,
  ssr: false,
});

function ExplorerRoute() {
  return (
    <ClientOnly fallback={<div style={{ minHeight: "100vh" }} />}>
      <ExplorerPage />
    </ClientOnly>
  );
}
