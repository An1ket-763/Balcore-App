import { useCallback, useMemo, useState } from "react";
import { LOGO } from "@/features/ui-preview/dashboard/logo";
import "./explorer.css";
import {
  csv,
  DEBT,
  EVENTS,
  fmt,
  METRICS,
  RANGES,
  shortAddress,
  tokf,
  WALLET_PROFILES,
  walletProfile,
  type MetricKey,
  type RangeKey,
} from "./data";
import { currentData, currentScope, isLiveView, liveScope, reserveSnapshot, selectedIndex } from "./derive";
import { useLiveStream } from "./live";
import ActivityFeed from "./components/ActivityFeed";
import DebtCard from "./components/DebtCard";
import Hero from "./components/Hero";
import KpiGrid from "./components/KpiGrid";
import MoneyFlow from "./components/MoneyFlow";
import PeriodBarChart from "./components/PeriodBarChart";
import ProofDrawer, { type ProofConfig } from "./components/ProofDrawer";
import ProvidersPanel, { PoolGrid, ProviderTable } from "./components/ProvidersPanel";
import ReserveSection from "./components/ReserveSection";
import Toast from "./components/Toast";
import WalletExplorer, { walletLiveData, type WalletMetric } from "./components/WalletExplorer";

const RANGE_KEYS: RangeKey[] = ["1W", "1M", "6M", "1Y", "ALL"];
const METRIC_COLORS: Record<MetricKey, string> = {
  tvl: "#7c8cf8",
  fees: "#e2e5f2",
  il: "#f3b850",
  dist: "#4bdfa1",
  surplusVault: "#8d7cf7",
};

export default function ExplorerPage() {
  const { live, togglePaused } = useLiveStream();
  const [range, setRange] = useState<RangeKey>("1M");
  const [period, setPeriod] = useState<string>("range");
  const [tab, setTab] = useState<"overview" | "providers">("overview");
  const [proof, setProof] = useState<ProofConfig | null>(null);
  const [toast, setToast] = useState({ message: "", show: false });
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletInput, setWalletInput] = useState("");
  const [searchValue, setSearchValue] = useState("");

  const data = currentData(range, period, live);
  const scope = currentScope(range);
  const scopeLive = liveScope(range, period, live);
  const focus = selectedIndex(range, period);
  const liveView = isLiveView(range, period);
  const reserveRows = useMemo(() => reserveSnapshot(range, period, live), [range, period, live]);

  const showToast = useCallback((message: string) => {
    setToast({ message, show: true });
    window.setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }, []);

  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* clipboard unavailable */
      }
      showToast("Copied");
    },
    [showToast],
  );

  function periodEvents(key: MetricKey, index: number): [string, string][] {
    const seed = index < 0 ? scope.length : index + 1;
    const suffix = String((seed * 7919 + key.length * 113) % 0xffff).padStart(4, "0");
    if (key === "tvl")
      return [
        ["POL balance", fmt(8400000)],
        ["User vault balances", fmt(16200000)],
        ["Snapshot block", "51,204,118"],
      ];
    if (key === "fees")
      return [
        [`${data.label} · AVAX/USDC`, `${fmt(data.fees * 0.44)} · 0x${suffix}…a1`],
        [`${data.label} · BTC.b/USDC`, `${fmt(data.fees * 0.33)} · 0x${suffix}…b2`],
        [`${data.label} · XAUT/USDC`, `${fmt(data.fees * 0.23)} · 0x${suffix}…c3`],
      ];
    if (key === "dist")
      return [
        [`Epoch ${200 + seed * 3}`, `${fmt(data.dist * 0.42)} · 0x${suffix}…d1`],
        [`Epoch ${199 + seed * 3}`, `${fmt(data.dist * 0.34)} · 0x${suffix}…d2`],
        [`Epoch ${198 + seed * 3}`, `${fmt(data.dist * 0.24)} · 0x${suffix}…d3`],
      ];
    if (key === "surplusVault")
      return [
        [`Settlement ${200 + seed}`, `${fmt(data.surplusVault * 0.45)} · 0x${suffix}…f1`],
        [`Settlement ${199 + seed}`, `${fmt(data.surplusVault * 0.33)} · 0x${suffix}…f2`],
        [`Settlement ${198 + seed}`, `${fmt(data.surplusVault * 0.22)} · 0x${suffix}…f3`],
      ];
    return [
      [`Position ${8800 + seed * 7}`, `${fmt(data.il * 0.46)} · 0x${suffix}…e1`],
      [`Position ${8790 + seed * 5}`, `${fmt(data.il * 0.31)} · 0x${suffix}…e2`],
      [`Position ${8770 + seed * 4}`, `${fmt(data.il * 0.23)} · 0x${suffix}…e3`],
    ];
  }

  function openMetric(key: MetricKey) {
    const m = METRICS[key];
    setProof({
      title: m.title,
      value: fmt(data[key] as number),
      range: `${data.label} · ${period === "range" ? "aggregate view" : "selected " + RANGES[range].unit}`,
      desc:
        key === "tvl"
          ? "Total liquidity is the sum of Balcore POL and all user-owned vault balances at one finalized block."
          : key === "surplusVault"
            ? "After IL coverage, the 5% protocol fee on converted income, and the user payout up to the annual cap, 70% of any remaining income is routed into the Surplus Vault — an emergency reserve, separate from POL, whose future use Balcore token holders will decide."
            : `${m.title} is reconstructed from the displayed event source for the selected period.`,
      rows: [
        ["Proof source", m.source],
        ["Event / getter", m.event],
        ["Method", m.method],
        ["Precision", "Raw uint256 values before display formatting"],
      ],
      chart: (
        <PeriodBarChart
          records={scopeLive}
          metricKey={key}
          color={METRIC_COLORS[key]}
          focus={focus}
          unit={RANGES[range].unit}
          onSelect={(id) => {
            setPeriod(id);
            window.setTimeout(() => openMetric(key), 20);
          }}
        />
      ),
      events: periodEvents(key, focus),
      recipe: `${m.method}\nPeriod: ${data.label}\nSource: ${m.source}`,
      api: `GET /v1/explorer/metrics/${key}?range=${range}&period=${period}`,
    });
  }

  function openReserveProof(id: string) {
    const r = reserveRows.find((x) => x.id === id);
    if (!r) return;
    setProof({
      title: `${r.asset} proof of liquidity`,
      value: fmt(r.total),
      range: `${liveView ? "Live snapshot" : "Finalized snapshot"} · block ${live.block.toLocaleString()}`,
      desc: `${r.asset} is split between reserve wallets and active market-making pools. This separates parked inventory from capital currently quoting inside Balcore markets.`,
      rows: [
        ["Asset", r.asset],
        ["In reserve wallets", fmt(r.reserve)],
        ["In active pools", fmt(r.active)],
        ["Reserve share", `${r.reservePct.toFixed(1)}%`],
        ["Active share", `${r.activePct.toFixed(1)}%`],
        ["Reserve scope", r.reserveScope],
        ["Active pool scope", r.pools],
        ["Method", "Read reserve balances and active pool inventory at the indexed block"],
      ],
      events: [
        ["Reserve wallets", `${fmt(r.reserve)} · parked inventory`],
        ["Active pools", `${fmt(r.active)} · deployed into ${r.pools}`],
        ["Deployment mix", `${r.reservePct.toFixed(1)}% reserve · ${r.activePct.toFixed(1)}% active`],
      ],
      recipe: `Read Balcore reserve addresses for ${r.asset}\nRead deployed pool inventory containing ${r.asset}\nSum reserve + active balances at block ${live.block}`,
      api: `GET /v1/explorer/reserves/${r.id}?block=${live.block}&range=${range}&period=${period}`,
    });
  }

  function openSummaryProof(kind: "total" | "reserve" | "active" | "coverage") {
    if (kind === "coverage") {
      document.getElementById("reserveCards")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const pick = (r: (typeof reserveRows)[number]) =>
      kind === "reserve" ? r.reserve : kind === "active" ? r.active : r.total;
    const total = reserveRows.reduce((a, r) => a + pick(r), 0);
    const title = kind === "reserve" ? "In reserve wallets" : kind === "active" ? "In active pools" : "Tracked asset value";
    setProof({
      title: title + " · reconciliation",
      value: fmt(total),
      range: `Live at block ${live.block.toLocaleString()} · sum of ${reserveRows.length} assets`,
      desc: "This figure is nothing but the sum of the asset rows below — no separate source. Each row carries its own on-chain proof path (wallet reads and pool positions), so verifying the parts verifies the whole.",
      rows: [
        ...reserveRows.map((r) => [r.asset, `${fmt(pick(r))} · ${tokf(r.asset, pick(r))}`] as [string, string]),
        ["Σ total", fmt(total)],
      ],
      api: `GET /v1/explorer/reserve/summary?field=${kind}`,
    });
  }

  function openDebtProof() {
    const total = DEBT.positions.reduce((a, p) => a + p.borrowed, 0);
    const minHf = Math.min(...DEBT.positions.map((p) => p.hf));
    setProof({
      title: "Borrowed capital & health",
      value: fmt(total),
      range: `Live venue reads · lowest HF ${minHf.toFixed(2)} · floor ${DEBT.floor.toFixed(2)}`,
      desc: "Borrowing is a shock absorber, not leverage: when the market moves hard in one direction, borrowed inventory lets the engine quote the other side and absorb the move. As conditions normalize, the debt is repaid. Health factor is read directly from each lending market’s own account data — their contracts assert our health, not ours.",
      rows: [
        ["Purpose", "Shock absorption on the other side of the market — never yield leverage"],
        ["Lifecycle", "Drawn at shock · repaid as the market normalizes"],
        ["Proof source", "Lending market account reads"],
        ...DEBT.positions.map(
          (p) =>
            [
              p.venue,
              `${p.getter} → HF ${p.hf.toFixed(2)} · borrowed ${fmt(p.borrowed)} ${p.asset} against ${p.collateral} · now ${p.deployed}`,
            ] as [string, string],
        ),
        ["Policy", `Auto-deleverage before the ${DEBT.floor.toFixed(2)} floor`],
        ["Precision", "Raw venue values before display formatting"],
      ],
      events: DEBT.positions.map((p) => [`${p.venue} account`, "Open on Snowtrace ↗"] as [string, string]),
      recipe:
        "Read HF via each venue getter for the treasury address\nBenqi: getAccountLiquidity · Aave v3: getUserAccountData",
      api: "GET /v1/explorer/debt/health",
    });
  }

  function openEventProof(index: number) {
    const e = EVENTS[index];
    if (!e) return;
    setProof({
      title: e.name,
      value: e.tx,
      range: `Observed ${e.age} ago`,
      desc: "One decoded contract log. Production opens the exact transaction and log index.",
      rows: [
        ["Proof type", "Transaction event log"],
        ["Network", "Avalanche C-Chain"],
        ["Payload", e.payload],
        ["Status", "Finalized"],
      ],
      events: [[e.payload, e.age]],
      recipe: `Open ${e.tx} and inspect ${e.name}`,
      api: `GET /v1/explorer/transactions/${e.tx}`,
    });
  }

  function openWalletProof(address: string, metric: WalletMetric) {
    const p = walletProfile(address);
    if (!p) return;
    const d = walletLiveData(p, live);
    const labels: Record<WalletMetric, string> = {
      deposited: "Total deposited",
      current: "Current position value",
      fees: "Fees earned",
      distributed: "Paid to wallet",
      claimable: "Claimable fees",
      il: "IL covered",
      net: "Net result",
      positions: "Active positions",
      wallet: "Complete wallet history",
    };
    const values: Record<WalletMetric, number> = {
      deposited: d.deposited,
      current: d.current,
      fees: d.fees,
      distributed: d.distributed,
      claimable: d.claimable,
      il: d.il,
      net: d.net,
      positions: p.positions.length,
      wallet: d.current + d.distributed,
    };
    setProof({
      title: labels[metric],
      value: metric === "positions" ? String(values[metric]) : fmt(values[metric]),
      range: `Wallet ${shortAddress(address)} · through block ${live.block.toLocaleString()}`,
      desc: "This wallet view filters deposits, position ownership, fee allocations, distributions, IL coverage and withdrawals where the searched address is an indexed participant.",
      rows: [
        ["Wallet", address],
        ["Proof source", "Position ownership + address-indexed events"],
        ["Active positions", String(p.positions.length)],
        ["First deposit", p.firstDeposit],
        ["Last settlement", p.lastSettlement],
      ],
      events: p.events.map((e) => [`${e.type} · ${e.detail}`, `${e.age} · ${e.tx}`] as [string, string]),
      recipe: `Filter Balcore events by wallet ${address}\nResolve owned positionIds\nSum deposits, distributions, fees and ILCovered events\nRead current position values at block ${live.block}`,
      api: `GET /v1/explorer/wallets/${address}?block=${live.block}`,
    });
  }

  const lookupWallet = useCallback(
    (raw: string, scroll = true) => {
      const address = raw.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        showToast("Enter a valid 42-character EVM wallet address");
        return false;
      }
      setTab("providers");
      setWalletAddress(address);
      setWalletInput(address);
      setSearchValue(address);
      if (scroll) {
        window.setTimeout(
          () => document.getElementById("walletExplorer")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          40,
        );
      }
      return true;
    },
    [showToast],
  );

  function clearWalletView() {
    setWalletAddress(null);
    setWalletInput("");
    setSearchValue("");
  }

  function handleGlobalSearch(raw: string) {
    const q = raw.trim();
    if (!q) {
      showToast("Enter a wallet, transaction, position or epoch");
      return;
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
      lookupWallet(q);
      return;
    }
    const eventIndex = EVENTS.findIndex(
      (e) => e.tx.toLowerCase() === q.toLowerCase() || e.name.toLowerCase() === q.toLowerCase(),
    );
    if (eventIndex >= 0) {
      openEventProof(eventIndex);
      return;
    }
    const positionMatch = q.match(/(?:position\s*#?|#)?(\d{3,})$/i);
    if (positionMatch) {
      const id = positionMatch[1];
      for (const [address, p] of Object.entries(WALLET_PROFILES)) {
        if (p.positions.some((x) => String(x.id) === id)) {
          lookupWallet(address);
          window.setTimeout(() => openWalletProof(address, "positions"), 120);
          return;
        }
      }
    }
    if (/^epoch\s*215$/i.test(q) || q === "215") {
      setTab("overview");
      window.setTimeout(
        () => document.getElementById("epochStrip")?.scrollIntoView({ behavior: "smooth", block: "center" }),
        40,
      );
      showToast("Epoch 215 selected");
      return;
    }
    setProof({
      title: "No indexed match",
      value: q,
      range: "Prototype search",
      desc: "Try a full EVM wallet address, one of the displayed transaction hashes, a position number such as 8841, or epoch 215.",
      rows: [
        ["Network", "Avalanche C-Chain"],
        ["Query", q],
        ["Indexed result", "No exact match"],
      ],
      events: [[q, "search query"]],
      recipe: `Search Balcore index for ${q}`,
      api: `GET /v1/explorer/search?q=${encodeURIComponent(q)}`,
    });
  }

  function stepPeriod(n: number) {
    if (focus < 0) {
      setPeriod(n > 0 ? (scope[0]?.id ?? "range") : (scope[scope.length - 1]?.id ?? "range"));
      return;
    }
    const next = Math.max(0, Math.min(scope.length - 1, focus + n));
    setPeriod(scope[next]?.id ?? "range");
  }

  function exportWallet() {
    const p = walletAddress ? walletProfile(walletAddress) : null;
    if (!p || !walletAddress) {
      showToast("No wallet profile to export");
      return;
    }
    const d = walletLiveData(p, live);
    csv(`balcore-wallet-${shortAddress(walletAddress).replace("…", "-")}.csv`, [
      ["wallet", walletAddress],
      ["metric", "value"],
      ["deposited", d.deposited],
      ["current_position_value", d.current],
      ["fees_earned", d.fees],
      ["distributed_to_wallet", d.distributed],
      ["claimable_fees", d.claimable],
      ["il_covered", d.il],
      ["net_result", d.net],
      ["net_return_percent", d.netPct.toFixed(4)],
      [],
      ["position_id", "pair", "deposited", "current_value", "fees_earned", "il_covered", "paid_out", "status"],
      ...p.positions.map((x) => [x.id, x.pair, x.deposited, x.current, x.fees, x.il, x.distributed, x.status]),
    ]);
    showToast("CSV downloaded");
  }

  function exportOverview() {
    csv(`balcore-overview-${range}-${period}.csv`, [
      ["period", data.label],
      ["metric", "value_usd"],
      ["total_liquidity", data.tvl],
      ["fees_collected", data.fees],
      ["il_covered", data.il],
      ["protocol_fee_5_percent", data.baseProtocol],
      ["paid_to_lps", data.dist],
      ["surplus_before_split", data.surplus],
      ["surplus_vault_70_percent", data.surplusVault],
      ["protocol_surplus_30_percent", data.protocolSurplus],
      ["total_protocol_revenue", data.rev],
      ["accounting_difference", data.difference],
    ]);
    showToast("CSV downloaded");
  }

  return (
    <div className="balcore-explorer">
      <div className="demo">
        <b>Prototype</b> — illustrative data, simulated live stream.
      </div>
      <Topbarish
        block={live.block}
        paused={live.paused}
        onTogglePaused={() => {
          togglePaused();
          showToast(live.paused ? "Live prototype updates resumed" : "Live prototype updates paused");
        }}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        onSearch={handleGlobalSearch}
      />
      <main className="shell">
        <Hero />

        <div className="tabs" role="tablist" aria-label="Explorer views">
          <button
            className={`tab${tab === "overview" ? " on" : ""}`}
            role="tab"
            aria-selected={tab === "overview"}
            tabIndex={tab === "overview" ? 0 : -1}
            onClick={() => setTab("overview")}
          >
            Protocol overview
          </button>
          <button
            className={`tab${tab === "providers" ? " on" : ""}`}
            role="tab"
            aria-selected={tab === "providers"}
            tabIndex={tab === "providers" ? 0 : -1}
            onClick={() => setTab("providers")}
          >
            Liquidity Providers
          </button>
        </div>

        <section className={`tab-panel${tab === "overview" ? " on" : ""}`} role="tabpanel" tabIndex={0}>
          <div className="section">
            <div className="section-head">
              <div>
                <h2>At a glance</h2>
                <p>
                  {RANGES[range].label}
                  {liveView && <span className="live-chip"> block {live.block.toLocaleString()}</span>}
                </p>
              </div>
              <div className="actions">
                <button className="btn" onClick={exportOverview}>
                  ↓ Export
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    void copyText(typeof location !== "undefined" ? location.href : "");
                  }}
                >
                  ↗ Share
                </button>
                <div className="range">
                  {RANGE_KEYS.map((r) => (
                    <button
                      key={r}
                      className={range === r ? "on" : ""}
                      aria-pressed={range === r}
                      onClick={() => {
                        setRange(r);
                        setPeriod("range");
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="period-controls">
                  <button className="period-nav" disabled={period === "range" || focus <= 0} onClick={() => stepPeriod(-1)}>
                    ‹
                  </button>
                  <select
                    className="period-select"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    aria-label="Select period"
                  >
                    <option value="range">{RANGES[range].total}</option>
                    {scope.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="period-nav"
                    disabled={period === "range" || focus >= scope.length - 1}
                    onClick={() => stepPeriod(1)}
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
            <div className="period-row">
              <div className="copy">
                <div className="period-title">{data.label}</div>
                <div className="period-note">
                  {liveView
                    ? "Live demo: balances reprice and event totals advance with each simulated block."
                    : `Historical ${RANGES[range].unit}: values remain fixed at that period's finalized snapshot.`}
                </div>
              </div>
            </div>
            <div className="epoch-strip" id="epochStrip" role="status" aria-live="polite">
              <span className="ep-badge">
                <span className="live-dot" />
                CURRENT EPOCH 215
              </span>
              <span className="ep-range">Mon Jul 13 → Sun Jul 19 · settles Mon Jul 20</span>
              <div className="ep-stats">
                <span>
                  Accrued<b>{live.epTokens.toLocaleString()}</b>units · pre-conversion
                </span>
                <span>
                  Converted<b>${(108400 + live.feesDelta).toLocaleString()}</b>at repositions
                </span>
                <span>
                  Distribution<b className="pending">pending settlement</b>
                </span>
              </div>
              <div className="data-status">
                <b>{live.paused ? "Updates paused" : "Prototype index"}</b> ·{" "}
                {live.paused ? "values frozen by viewer" : "simulated block stream"}
              </div>
            </div>
            <KpiGrid
              data={data}
              scopeLength={scope.length}
              range={range}
              live={liveView}
              onOpenProof={openMetric}
            />
          </div>

          <div className="section">
            <ReserveSection
              rows={reserveRows}
              block={live.block}
              onSummaryProof={openSummaryProof}
              onAssetProof={openReserveProof}
            />
            <DebtCard onProof={openDebtProof} />
            <MoneyFlow d={data} onSurplusProof={() => openMetric("surplusVault")} />
          </div>

          <ActivityFeed onEventProof={openEventProof} />
        </section>

        <section className={`tab-panel${tab === "providers" ? " on" : ""}`} role="tabpanel" tabIndex={0}>
          <ProvidersPanel
            data={data}
            block={live.block}
            filterAddress={walletAddress}
            onClearFilter={clearWalletView}
          />
          <WalletExplorer
            address={walletAddress}
            inputValue={walletInput}
            onInputChange={setWalletInput}
            onLookup={(raw) => lookupWallet(raw)}
            onDemo={() => lookupWallet("0xdeA7000000000000000000000000000000009db3")}
            onClear={clearWalletView}
            onExport={exportWallet}
            onWalletProof={(metric) => walletAddress && openWalletProof(walletAddress, metric)}
            live={live}
          />
          <ProviderTable filterAddress={walletAddress} onClearFilter={clearWalletView} />
          <PoolGrid />
          <div className="note">
            <b>POL, user capital and the Surplus Vault are never blended.</b> POL is funded by Balcore
            Inc. The Surplus Vault is a separate emergency reserve — never POL — and Balcore token
            holders will decide how it serves the protocol’s growth.
          </div>
        </section>

        <footer className="footer">
          <span>
            <b>Balcore Explorer</b> · reads the chain, never the other way around
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Be the Market Maker
            <img src={LOGO} alt="" aria-hidden="true" style={{ width: 15, height: 15, objectFit: "contain" }} />
          </span>
        </footer>
      </main>

      <ProofDrawer proof={proof} onClose={() => setProof(null)} onCopy={copyText} onToast={showToast} />
      <Toast message={toast.message} show={toast.show} />
    </div>
  );
}

// Local alias keeps the topbar import close to where it is used.
import Topbarish from "./components/Topbar";
