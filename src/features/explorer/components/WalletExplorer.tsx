import { fmt, shortAddress, walletProfile, type WalletProfile } from "../data";
import type { LiveState } from "../live";

export interface WalletLiveData extends WalletProfile {
  net: number;
  netPct: number;
}

export function walletLiveData(profile: WalletProfile, live: LiveState): WalletLiveData {
  const share = profile.current / 16200000;
  const current = profile.current + Math.round(live.tvlDelta * share);
  const fees = profile.fees + Math.round(live.feesDelta * share);
  const il = profile.il + Math.round(live.ilDelta * share);
  const distributed = profile.distributed + Math.round(live.distDelta * share);
  const claimable = Math.max(0, fees - distributed);
  const net = current + distributed + profile.withdrawn - profile.deposited;
  return {
    ...profile,
    current,
    fees,
    il,
    distributed,
    claimable,
    net,
    netPct: profile.deposited ? (net / profile.deposited) * 100 : 0,
  };
}

export type WalletMetric =
  | "deposited"
  | "current"
  | "fees"
  | "distributed"
  | "claimable"
  | "il"
  | "net"
  | "positions"
  | "wallet";

export default function WalletExplorer({
  address,
  inputValue,
  onInputChange,
  onLookup,
  onDemo,
  onClear,
  onExport,
  onWalletProof,
  live,
}: {
  address: string | null;
  inputValue: string;
  onInputChange: (v: string) => void;
  onLookup: (raw: string) => void;
  onDemo: () => void;
  onClear: () => void;
  onExport: () => void;
  onWalletProof: (metric: WalletMetric) => void;
  live: LiveState;
}) {
  const profile = address ? walletProfile(address) : null;
  const d = profile ? walletLiveData(profile, live) : null;

  const positionCurrentTotal = profile ? profile.positions.reduce((a, p) => a + p.current, 0) : 0;
  const scale = profile && positionCurrentTotal && d ? d.current / positionCurrentTotal : 1;

  const stats: [string, number, string, WalletMetric][] = d
    ? [
        ["Total deposited", d.deposited, "Principal supplied", "deposited"],
        ["Current position value", d.current, "Oracle-priced, updates per block", "current"],
        ["Fees earned", d.fees, "Gross wallet fee allocation", "fees"],
        ["Paid to wallet", d.distributed, "Completed LP distributions", "distributed"],
        ["Claimable now", d.claimable, "Earned but not yet distributed", "claimable"],
        ["IL covered", d.il, "Restored before user payout", "il"],
        ["Net result", d.net, `${d.netPct >= 0 ? "+" : ""}${d.netPct.toFixed(1)}% versus deposits`, "net"],
        ["Active positions", d.positions.length, "Across Balcore markets", "positions"],
      ]
    : [];

  return (
    <div className="section" id="walletExplorer">
      <div className="section-head">
        <div>
          <h2>Wallet explorer</h2>
          <p>Filter the explorer to one LP wallet and reconstruct everything that belongs to it</p>
        </div>
      </div>
      <div className="card">
        <div className="wallet-lite">
          <input
            placeholder="Enter an Avalanche wallet · 0x…"
            spellCheck={false}
            autoComplete="off"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onLookup((e.target as HTMLInputElement).value);
            }}
          />
          <button className="btn" onClick={onDemo}>
            Use demo wallet
          </button>
          <button className="btn primary" onClick={() => onLookup(inputValue)}>
            View wallet
          </button>
        </div>

        <div className={`wallet-zero${address && !profile ? " show" : ""}`}>
          <h4>No Balcore positions found</h4>
          <p>
            {address
              ? `${shortAddress(address)} has no deposits, positions, distributions or IL-coverage events in this index.`
              : "This valid address has no deposits, positions, distributions or IL-coverage events in the index."}
          </p>
        </div>

        <div className={`wallet-result${profile ? " show" : ""}`} aria-live="polite">
          {profile && d && address && (
            <>
              <div className="wallet-head">
                <div>
                  <div className="wallet-kicker">Filtered wallet view</div>
                  <div className="wallet-address">{address}</div>
                  <div className="wallet-meta">
                    First deposit {profile.firstDeposit} · last settlement {profile.lastSettlement} ·{" "}
                    {profile.positions.length} active position
                    {profile.positions.length === 1 ? "" : "s"} · {d.shareUser} of user liquidity
                  </div>
                </div>
                <div className="wallet-head-actions">
                  <span className="wallet-status">Active LP</span>
                  <button className="btn" onClick={onExport}>
                    ↓ Export wallet
                  </button>
                  <button className="btn" onClick={onClear}>
                    Clear filter
                  </button>
                </div>
              </div>

              <div className="wallet-kpis">
                {stats.map(([k, v, sub, metric]) => (
                  <article
                    className="wallet-stat"
                    key={metric}
                    tabIndex={0}
                    onClick={() => onWalletProof(metric)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onWalletProof(metric);
                      }
                    }}
                  >
                    <span className="wp">PROOF ↗</span>
                    <div className="k">{k}</div>
                    <div
                      className={`v ${
                        ["fees", "distributed", "claimable", "net"].includes(metric)
                          ? "mint"
                          : metric === "il"
                            ? "gold"
                            : ""
                      }`}
                    >
                      {metric === "positions" ? v : fmt(v)}
                    </div>
                    <div className="s">{sub}</div>
                  </article>
                ))}
              </div>

              <div className="wallet-grid">
                <div className="wallet-panel">
                  <h4>Active positions</h4>
                  <div className="sub">Every position, its current value, fees and IL restoration.</div>
                  <div className="wallet-table-wrap">
                    <table className="wallet-table">
                      <thead>
                        <tr>
                          <th>Position</th>
                          <th>Deposited</th>
                          <th>Current value</th>
                          <th>Fees earned</th>
                          <th>IL covered</th>
                          <th>Paid out</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.positions.map((p) => {
                          const cur = Math.round(p.current * scale);
                          const fee = p.fees + Math.round((d.fees - profile.fees) * (p.fees / profile.fees));
                          const il = p.il + Math.round((d.il - profile.il) * (p.il / profile.il));
                          const dist =
                            p.distributed +
                            Math.round((d.distributed - profile.distributed) * (p.distributed / profile.distributed));
                          return (
                            <tr key={p.id}>
                              <td>
                                <div className="wallet-pair">
                                  <b>{p.pair}</b>
                                  <small>
                                    Position #{p.id} · {p.range}
                                  </small>
                                </div>
                              </td>
                              <td className="mono">{fmt(p.deposited)}</td>
                              <td className="mono">{fmt(cur)}</td>
                              <td className="mono mint">{fmt(fee)}</td>
                              <td className="mono gold">{fmt(il)}</td>
                              <td className="mono">{fmt(dist)}</td>
                              <td>
                                <span className="range-status">{p.status}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="wallet-panel">
                  <h4>Wallet accounting</h4>
                  <div className="sub">What went in, what remains, and what has already left the vault.</div>
                  <div className="wallet-accounting">
                    {(
                      [
                        ["Deposited principal", fmt(d.deposited)],
                        ["Current position value", fmt(d.current)],
                        ["Distributions already paid", "+" + fmt(d.distributed)],
                        ["Previous withdrawals", "+" + fmt(d.withdrawn)],
                        ["Claimable fees", fmt(d.claimable)],
                        ["IL restored by Shield Vault", fmt(d.il)],
                        ["Net wealth versus deposits", (d.net >= 0 ? "+" : "") + fmt(d.net)],
                        ["Wallet return", (d.netPct >= 0 ? "+" : "") + d.netPct.toFixed(2) + "%"],
                      ] as [string, string][]
                    ).map((r, i) => (
                      <div className={`wallet-accounting-row ${i >= 6 ? "total" : ""}`} key={r[0]}>
                        <span>{r[0]}</span>
                        <span>{r[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="wallet-bottom">
                <div className="wallet-panel">
                  <h4>Recent wallet events</h4>
                  <div className="sub">Only events where this address is depositor, owner or recipient.</div>
                  <div className="wallet-events">
                    {profile.events.map((e, i) => (
                      <div className="wallet-event" key={i}>
                        <span
                          className={`type ${
                            e.type === "IL covered" ? "gold" : e.type === "Distribution" ? "mint" : "violet"
                          }`}
                        >
                          {e.type}
                        </span>
                        <span className="detail">
                          {e.detail}
                          {e.amount ? " · " + fmt(e.amount) : ""}
                        </span>
                        <span className="right">
                          {e.age} · {e.tx}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="wallet-panel">
                  <h4>Available now</h4>
                  <div className="sub">Current wallet-level actions reconstructed from position state.</div>
                  <div className="wallet-actions-list">
                    {(
                      [
                        ["Available to withdraw", fmt(d.current)],
                        ["Claimable fees", fmt(d.claimable)],
                        ["Pending withdrawal queue", "None"],
                        ["Next weekly settlement", "Monday · 00:00 UTC"],
                      ] as [string, string][]
                    ).map((r) => (
                      <div className="wallet-action" key={r[0]}>
                        <span>{r[0]}</span>
                        <span>{r[1]}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => onWalletProof("wallet")}
                  >
                    View complete wallet proof ↗
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
