/**
 * Dev harness — raw JSON proof that the Balcore integration works against
 * mainnet, for BOTH the reads and the writes.
 *
 * NOT linked from anywhere in the app and not part of any screen: reach it by
 * typing /dev/balcore. It exists so the contract layer can be verified against
 * the live contracts without a single line of production UI depending on it.
 *
 * THE WRITE HALF SENDS NOTHING. Every button below calls the hook's `dryRun()`,
 * which is an `eth_call` through `simulateContract` — the same dry run that
 * guards the real actions, just surfaced instead of consumed. No wallet opens,
 * no signature is requested, no transaction exists. That is what makes it safe
 * to point at mainnet with real addresses before anyone risks money, and it is
 * the step that has to pass before the first real deposit.
 *
 * `?address=0x…` runs the whole page AS that address, reads and dry-runs alike:
 * `simulateContract` takes an `account` and calls from it, so any holder can be
 * inspected with no key. Use the two live depositors to see a real pending
 * withdrawal and a real `NothingToClaim`.
 *
 * Client-only and `noindex`, same shape as the main route: wagmi hooks cannot
 * run during SSR, and `Web3Providers` is what supplies them.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { parseUnits, type Address } from "viem";
import Web3Providers from "@/providers/Web3Providers";
import {
  BALCORE_DEPLOYED,
  BALCORE_POOLS,
  useClaimYield,
  useDeposit,
  useFastTrackAvailability,
  useFastTrack,
  useUserPosition,
  useVaultStats,
  useWithdraw,
  type DryRunResult,
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

const btn: React.CSSProperties = {
  font: "500 12px/1 ui-monospace, Menlo, monospace",
  background: "#1a1a2e",
  color: "#d8d8e6",
  border: "1px solid #2e2e48",
  borderRadius: 6,
  padding: "8px 11px",
  cursor: "pointer",
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
 * Read `?address=0x…` so the hooks can be exercised against a known holder
 * without connecting a wallet. Falls back to the connected account.
 */
function useInspectAddress(): Address | undefined {
  const { address } = useAccount();
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q && /^0x[0-9a-fA-F]{40}$/.test(q)) return q as Address;
  }
  return address;
}

/** Whether the address came from the query string rather than a wallet. */
function useIsInspecting(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("address");
  return Boolean(q && /^0x[0-9a-fA-F]{40}$/.test(q));
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

function PoolReads({ poolKey }: { poolKey: PoolKey }) {
  const address = useInspectAddress();
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
          address
            ? { isLoading: position.isLoading, isError: position.isError, data: position.data }
            : "connect a wallet, or pass ?address=0x… , to populate this read"
        }
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Writes — dry run only                                               */
/* ------------------------------------------------------------------ */

/** One button plus the last result it produced. */
function Probe({
  label,
  run,
  note,
}: {
  label: string;
  run: () => Promise<DryRunResult>;
  note?: string;
}) {
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        style={{ ...btn, opacity: busy ? 0.6 : 1 }}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          run()
            .then(setResult)
            .catch((e: unknown) =>
              setResult({
                outcome: "failed",
                call: null,
                revert: null,
                result: null,
                note: e instanceof Error ? e.message : String(e),
              }),
            )
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "simulating…" : label}
      </button>
      {note ? (
        <span style={{ font: "400 11px/1.5 system-ui", color: "#6f6f85", marginLeft: 10 }}>
          {note}
        </span>
      ) : null}
      {result ? (
        <pre style={{ ...mono, marginTop: 8 }}>{JSON.stringify(result, replacer, 2)}</pre>
      ) : null}
    </div>
  );
}

function PoolWrites({ poolKey }: { poolKey: PoolKey }) {
  const address = useInspectAddress();
  const inspecting = useIsInspecting();
  const inspectOpts = inspecting && address ? { inspectAs: address } : undefined;

  // A small, realistic deposit: the USDC leg typed, the tokenA leg MATCHED at
  // the live feed price. Typing the pair by hand is how you get a
  // DepositRatioOutOfBounds that tells you nothing about the plumbing.
  const [usdcInput, setUsdcInput] = useState("100");
  const usdcAmount = (() => {
    try {
      return parseUnits(usdcInput.replace(/,/g, "").trim() || "0", 6);
    } catch {
      return 0n;
    }
  })();

  const probe = useDeposit(poolKey, { mode: "both", tokenAAmount: 0n, usdcAmount }, inspectOpts);
  // Now pin the tokenA leg to the USDC leg at the live price, and re-derive.
  const deposit = useDeposit(
    poolKey,
    { mode: "both", tokenAAmount: probe.matchTokenAForUsdc(usdcAmount), usdcAmount },
    inspectOpts,
  );
  const withdraw = useWithdraw(poolKey, inspectOpts);
  const claim = useClaimYield(poolKey, inspectOpts);
  const fast = useFastTrack(poolKey, inspectOpts);

  return (
    <>
      <h2
        style={{
          font: "600 14px/1.4 system-ui",
          color: "#2ee6a8",
          margin: "32px 0 4px",
          borderTop: "1px solid #23233a",
          paddingTop: 24,
        }}
      >
        writes — DRY RUN ONLY ({poolKey})
      </h2>
      <p style={{ font: "400 12px/1.6 system-ui", color: "#8a8a9e", margin: "0 0 16px" }}>
        Each button runs <code>simulateContract</code> from <code>{address ?? "(no address)"}</code>{" "}
        and prints what the chain says. Nothing is signed and nothing is sent.{" "}
        {inspecting ? "Inspecting a query-string address: the write actions are refused." : ""}
      </p>

      {/* ---- deposit ---- */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ font: "500 12px/1 system-ui", color: "#8a8a9e", marginRight: 8 }}>
          USDC leg
        </label>
        <input
          value={usdcInput}
          onChange={(e) => setUsdcInput(e.target.value)}
          inputMode="decimal"
          style={{
            font: "500 12px/1 ui-monospace, Menlo, monospace",
            background: "#0b0b16",
            color: "#d8d8e6",
            border: "1px solid #2e2e48",
            borderRadius: 6,
            padding: "7px 9px",
            width: 120,
          }}
        />
        <span style={{ font: "400 11px/1.5 system-ui", color: "#6f6f85", marginLeft: 10 }}>
          tokenA leg is MATCHED at the live feed price
        </span>
      </div>

      <Block
        title={`useDeposit("${poolKey}") — derived state`}
        value={{
          price8: deposit.price8,
          legs: deposit.legs,
          valuation: deposit.valuation,
          plan: deposit.plan,
          needsApproval: deposit.needsApproval,
          checks: deposit.checks,
          stage: deposit.stage,
          error: deposit.error,
        }}
      />
      <Probe
        label="dry-run deposit(tokenA, usdc)"
        run={deposit.dryRun}
        note="expect a revert while the legs are unapproved — that is the allowance, not the pool"
      />

      {/* ---- withdraw ---- */}
      <Block
        title={`useWithdraw("${poolKey}") — derived state`}
        value={{
          status: withdraw.status,
          primaryAction: withdraw.primaryAction,
          shares: withdraw.shares,
          readyAt: withdraw.readyAt,
          countdown: withdraw.countdown,
          basket: withdraw.basket,
          preview: withdraw.preview,
          runMode: withdraw.runMode,
          queueHead: withdraw.queueHead,
          checks: withdraw.checks,
        }}
      />
      <Probe label="dry-run requestWithdraw()" run={() => withdraw.dryRun("request")} />
      <Probe label="dry-run executeWithdraw()" run={() => withdraw.dryRun("execute")} />
      <Probe label="dry-run cancelWithdraw()" run={() => withdraw.dryRun("cancel")} />

      {/* ---- claim ---- */}
      <Block
        title={`useClaimYield("${poolKey}") — derived state`}
        value={{
          claimable: claim.claimable,
          currentEpoch: claim.currentEpoch,
          lastClaimedEpoch: claim.lastClaimedEpoch,
          disabledReason: claim.disabledReason,
          checks: claim.checks,
        }}
      />
      <Probe label="dry-run claimYield()" run={claim.dryRun} />

      {/* ---- fast-track ---- */}
      <Block
        title={`useFastTrack("${poolKey}") — derived state`}
        value={{
          available: fast.available,
          unavailableReason: fast.unavailableReason,
          runMode: fast.runMode,
          preview: fast.preview,
          dailyCapRemaining: fast.dailyCapRemaining,
          sourceableNet: fast.sourceableNet,
          disabledReason: fast.disabledReason,
          checks: fast.checks,
        }}
      />
      <Probe
        label="dry-run fastTrackWithdraw()"
        run={fast.dryRun}
        note="expect FastTrackSuspendedDuringRun while the BTC pool is in run mode"
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

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
  const address = useInspectAddress();
  const inspecting = useIsInspecting();

  return (
    <main style={{ background: "#07070f", minHeight: "100vh", padding: "32px 24px" }}>
      <h1 style={{ font: "600 18px/1.4 system-ui", color: "#f2f2f7", margin: "0 0 6px" }}>
        Balcore dev harness — reads and dry-run writes
      </h1>
      <p style={{ font: "400 13px/1.5 system-ui", color: "#8a8a9e", margin: "0 0 8px" }}>
        deployed: {String(BALCORE_DEPLOYED)} · pools:{" "}
        {BALCORE_POOLS.map((p) => `${p.key}(${p.status})`).join(", ") || "none"} · acting as{" "}
        {address ?? "nobody"} {inspecting ? "(query string, view-only)" : "(connected wallet)"}
      </p>
      <p style={{ font: "400 12px/1.6 system-ui", color: "#6f6f85", margin: "0 0 24px" }}>
        The two live depositors, for copy-paste:
        <br />
        <code>?address=0x4EF4f6Bf10e5B9B22c77048332d460930a629365</code> — wallet A, holds shares,
        no withdrawal
        <br />
        <code>?address=0x626328C6E62A3F829A020132Bb6F47c80d8F5ac3</code> — wallet B, live pending
        request
      </p>

      {!BALCORE_DEPLOYED ? (
        <pre style={mono}>Balcore is not deployed on this network. Set VITE_CHAIN_ENV=mainnet.</pre>
      ) : (
        BALCORE_POOLS.map((p) => (
          <div key={p.key}>
            <PoolReads poolKey={p.key} />
            <PoolWrites poolKey={p.key} />
          </div>
        ))
      )}
    </main>
  );
}
