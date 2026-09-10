/**
 * Dev harness — raw JSON proof that the Balcore reads work against mainnet.
 *
 * NOT linked from anywhere in the app and not part of any screen: reach it by
 * typing /dev/balcore. It exists so the read layer can be verified against the
 * live contracts without a single line of production UI depending on it.
 *
 * Client-only and `noindex`, same shape as the main route: wagmi hooks cannot
 * run during SSR, and `Web3Providers` is what supplies them.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import Web3Providers from "@/providers/Web3Providers";
import {
  BALCORE_DEPLOYED,
  BALCORE_POOLS,
  useFastTrackAvailability,
  useUserPosition,
  useVaultStats,
  type PoolKey,
} from "@/lib/balcore";

export const Route = createFileRoute("/dev/balcore")({
  head: () => ({
    meta: [{ title: "Balcore reads — dev harness" }, { name: "robots", content: "noindex" }],
  }),
  component: DevHarness,
  ssr: false,
});

/** JSON.stringify cannot serialise bigint; render them as decimal strings. */
function replacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return undefined;
  return value;
}

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "#0b0b16",
  color: "#d8d8e6",
  padding: 16,
  borderRadius: 8,
  overflowX: "auto",
};

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ font: "600 14px/1.4 system-ui", color: "#8b7bf5", margin: "0 0 8px" }}>
        {title}
      </h2>
      <pre style={mono}>{JSON.stringify(value, replacer, 2)}</pre>
    </section>
  );
}

/**
 * Read `?address=0x…` so the position hook can be exercised against a known
 * holder without connecting a wallet. View-only — `useUserPosition` takes the
 * address as an argument and never needs a signer. Falls back to the connected
 * account when the parameter is absent.
 */
function useInspectAddress(): Address | undefined {
  const { address } = useAccount();
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q && /^0x[0-9a-fA-F]{40}$/.test(q)) return q as Address;
  }
  return address;
}

function PoolReads({ poolKey }: { poolKey: PoolKey }) {
  const address = useInspectAddress();
  const isConnected = Boolean(address);
  const stats = useVaultStats(poolKey);
  const position = useUserPosition(poolKey, address);
  const fastTrack = useFastTrackAvailability(poolKey);

  return (
    <>
      <Block
        title={`useVaultStats("${poolKey}")`}
        value={{ isLoading: stats.isLoading, isError: stats.isError, data: stats.data }}
      />
      <Block
        title={`useFastTrackAvailability("${poolKey}")`}
        value={{
          isLoading: fastTrack.isLoading,
          isError: fastTrack.isError,
          data: fastTrack.data,
        }}
      />
      <Block
        title={`useUserPosition("${poolKey}", ${address ?? "undefined"})`}
        value={
          isConnected
            ? {
                isLoading: position.isLoading,
                isError: position.isError,
                data: position.data,
              }
            : "connect a wallet, or pass ?address=0x… , to populate this read"
        }
      />
    </>
  );
}

function DevHarness() {
  return (
    <ClientOnly fallback={<div style={{ minHeight: "100vh", background: "#07070f" }} />}>
      <Web3Providers>
        <Harness />
      </Web3Providers>
    </ClientOnly>
  );
}

function Harness() {
  return (
    <main style={{ background: "#07070f", minHeight: "100vh", padding: "32px 24px" }}>
      <h1 style={{ font: "600 18px/1.4 system-ui", color: "#f2f2f7", margin: "0 0 6px" }}>
        Balcore reads — dev harness
      </h1>
      <p style={{ font: "400 13px/1.5 system-ui", color: "#8a8a9e", margin: "0 0 24px" }}>
        deployed: {String(BALCORE_DEPLOYED)} · pools:{" "}
        {BALCORE_POOLS.map((p) => `${p.key}(${p.status})`).join(", ") || "none"}
      </p>

      {!BALCORE_DEPLOYED ? (
        <pre style={mono}>Balcore is not deployed on this network. Set VITE_CHAIN_ENV=mainnet.</pre>
      ) : (
        BALCORE_POOLS.map((p) => <PoolReads key={p.key} poolKey={p.key} />)
      )}
    </main>
  );
}
