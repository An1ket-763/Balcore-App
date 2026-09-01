import { fmt, tokf } from "../data";
import type { ReserveRow } from "../derive";

function MixBar({ r }: { r: ReserveRow }) {
  return (
    <>
      <div
        className="reserve-mix"
        role="img"
        aria-label={`${r.asset}: ${r.reservePct.toFixed(1)} percent in reserve and ${r.activePct.toFixed(1)} percent in active pools`}
      >
        <span
          className="reserve-segment reserve"
          style={{ width: `${r.reservePct}%` }}
          title={`In reserve · ${fmt(r.reserve)}`}
        >
          Reserve {r.reservePct.toFixed(0)}%
        </span>
        <span
          className="reserve-segment active"
          style={{ width: `${r.activePct}%` }}
          title={`In active pools · ${fmt(r.active)}`}
        >
          Active {r.activePct.toFixed(0)}%
        </span>
      </div>
      <div className="reserve-key">
        <span>
          <i style={{ background: "var(--violet)" }} />
          Reserve {fmt(r.reserve)}
        </span>
        <span>
          <i style={{ background: "var(--mint)" }} />
          Active {fmt(r.active)}
        </span>
      </div>
    </>
  );
}

export default function ReserveSection({
  rows,
  block,
  onSummaryProof,
  onAssetProof,
}: {
  rows: ReserveRow[];
  block: number;
  onSummaryProof: (kind: "total" | "reserve" | "active" | "coverage") => void;
  onAssetProof: (id: string) => void;
}) {
  const reserveTotal = rows.reduce((s, r) => s + r.reserve, 0);
  const activeTotal = rows.reduce((s, r) => s + r.active, 0);
  const trackedTotal = rows.reduce((s, r) => s + r.total, 0);

  const summary: [typeof onSummaryProof extends never ? never : "total" | "reserve" | "active" | "coverage", string, string, string, string][] =
    [
      ["total", "Tracked asset value", "VIEW PROOF ↗", fmt(trackedTotal), `Across ${rows.length} reserve assets`],
      [
        "reserve",
        "In reserve wallets",
        "VIEW PROOF ↗",
        fmt(reserveTotal),
        `${((reserveTotal / trackedTotal) * 100).toFixed(1)}% parked and available`,
      ],
      [
        "active",
        "In active pools",
        "VIEW PROOF ↗",
        fmt(activeTotal),
        `${((activeTotal / trackedTotal) * 100).toFixed(1)}% deployed`,
      ],
      ["coverage", "Proof coverage", "SEE THE ROWS ↘", "100%", "Every asset row opens its proof path"],
    ];

  return (
    <div className="section" id="liquidityProofOverview">
      <div className="section-head">
        <div>
          <h2>Proof of liquidity</h2>
          <p>
            Reserve inventory and active pool deployment · <span className="live-chip">block {block.toLocaleString()}</span>
          </p>
        </div>
      </div>
      <div className="lp-summary">
        {summary.map(([kind, label, proofLabel, value, sub]) => (
          <div
            className="summary-card"
            key={kind}
            tabIndex={0}
            role="button"
            style={{ cursor: "pointer" }}
            onClick={() => onSummaryProof(kind)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSummaryProof(kind);
              }
            }}
          >
            <div className="l">
              {label} <span className="proof" style={{ float: "right" }}>{proofLabel}</span>
            </div>
            <div className={`v${kind === "reserve" ? " violet" : kind === "active" ? " mint" : ""}`}>{value}</div>
            <div className="s">{sub}</div>
          </div>
        ))}
      </div>

      <div className="liquidity-overview-card">
        <div className="liquidity-overview-head">
          <div>
            <h3>Where every tracked asset sits</h3>
            <div className="sub">
              Reserve balances remain available outside the pools. Active balances are currently
              deployed into Balcore market-making positions.
            </div>
          </div>
          <span className="difference">✓ 100% accounted</span>
        </div>
        <div className="liquidity-asset-grid" id="reserveCards">
          {rows.map((r) => (
            <article
              className="card"
              key={r.id}
              tabIndex={0}
              role="button"
              aria-label={`View ${r.asset} proof of liquidity`}
              style={{ marginTop: 12, cursor: "pointer" }}
              onClick={() => onAssetProof(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAssetProof(r.id);
                }
              }}
            >
              <div className="kpi-top">
                <span>
                  <b>{r.asset}</b>
                </span>
                <span className="proof">VIEW PROOF ↗</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <MixBar r={r} />
              </div>
              <div className="sub" style={{ marginTop: 7, fontFamily: "var(--mono)" }}>
                {tokf(r.asset, r.total)} tracked
              </div>
              <details className="card-more" onClick={(e) => e.stopPropagation()}>
                <summary>Totals &amp; scope</summary>
                <div className="more-body">
                  <div className="wallet-accounting">
                    <div className="wallet-acct">
                      <span>In reserve</span>
                      <b>
                        {fmt(r.reserve)} <i className="tok">· {tokf(r.asset, r.reserve)}</i>
                      </b>
                    </div>
                    <div className="wallet-acct">
                      <span>In active pools</span>
                      <b>
                        {fmt(r.active)} <i className="tok">· {tokf(r.asset, r.active)}</i>
                      </b>
                    </div>
                    <div className="wallet-acct">
                      <span>Total tracked</span>
                      <b>
                        {fmt(r.total)} <i className="tok">· {tokf(r.asset, r.total)}</i>
                      </b>
                    </div>
                  </div>
                  <div className="sub" style={{ marginTop: 8 }}>
                    {r.scope}
                  </div>
                </div>
              </details>
            </article>
          ))}
        </div>
        <details className="reserve-details">
          <summary>View complete asset and contract scope</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>In reserve</th>
                  <th>In active pools</th>
                  <th>Total tracked</th>
                  <th>Deployment mix</th>
                  <th>Scope</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.asset}</b>
                      <div className="sub" style={{ marginTop: 4 }}>
                        {r.scope}
                      </div>
                    </td>
                    <td>
                      {fmt(r.reserve)}
                      <div className="sub mono-sub">{tokf(r.asset, r.reserve)}</div>
                    </td>
                    <td>
                      {fmt(r.active)}
                      <div className="sub mono-sub">{tokf(r.asset, r.active)}</div>
                    </td>
                    <td>
                      {fmt(r.total)}
                      <div className="sub mono-sub">{tokf(r.asset, r.total)}</div>
                    </td>
                    <td>
                      <MixBar r={r} />
                    </td>
                    <td>
                      <div>{r.pools}</div>
                      <div className="sub" style={{ marginTop: 4 }}>
                        {r.reserveScope}
                      </div>
                    </td>
                    <td>
                      <button className="btn" onClick={() => onAssetProof(r.id)}>
                        View proof
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
