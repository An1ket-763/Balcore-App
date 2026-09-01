import { fmt, MONTHSALL, type PeriodRecord } from "../data";

const PARTS: [keyof PeriodRecord, string, string][] = [
  ["il", "IL covered first", "#f3b850"],
  ["baseProtocol", "Protocol fee · 5%", "#8d7cf7"],
  ["dist", "To users", "#4bdfa1"],
  ["surplusVault", "Surplus Vault · 70%", "#a6a9bc"],
  ["protocolSurplus", "Protocol surplus · 30%", "#aa9eff"],
];

export default function MoneyFlow({ d, onSurplusProof }: { d: PeriodRecord; onSurplusProof: () => void }) {
  const lifetimeSurplus = MONTHSALL.reduce((s, r) => s + r.surplusVault, 0);
  const steps: [string, string, number, string][] = [
    ["1", "Fees collected", d.fees, "Converted at reposition"],
    ["2", "Cover IL", d.il, "Paid before any fee or payout"],
    ["3", "Protocol fee", d.baseProtocol, "5% of converted income, routed after IL"],
    ["4", "Pay users", d.dist, "Up to the 30% annualized user cap"],
    ["5", "Split surplus", d.surplus, "70% vault · 30% protocol"],
  ];

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Money flow</h2>
          <p>Every collected dollar reconciled</p>
        </div>
      </div>
      <div className="money-card">
        <div className="money-top">
          <div>
            <h3>Where {fmt(d.fees)} went</h3>
            <details className="card-more" style={{ marginTop: 6 }}>
              <summary>How settlement works</summary>
              <div className="more-body">
                <p>
                  Income is converted to USDC into the fee vault at each reposition. Settlement then
                  follows one fixed order: cover IL, route 5% to the protocol, pay users up to the
                  annual cap, then split any remaining surplus 70:30.
                </p>
              </div>
            </details>
          </div>
          <span className="difference">✓ Difference ${Math.abs(d.difference).toFixed(2)}</span>
        </div>
        <div className="flowbar">
          {PARTS.map(([k, n, c]) => {
            const p = ((d[k] as number) / d.fees) * 100;
            return (
              <span key={k} style={{ width: `${p}%`, background: c }} title={`${n} · ${fmt(d[k] as number)}`}>
                {p >= 9 ? Math.round(p) + "%" : ""}
              </span>
            );
          })}
        </div>
        <div className="flowlegend">
          {PARTS.map(([k, n, c]) => (
            <div className="legend" key={k}>
              <div className="l">
                <span className="swatch" style={{ background: c }} />
                {n}
              </div>
              <div className="v">{fmt(d[k] as number)}</div>
              <div className="p">{(((d[k] as number) / d.fees) * 100).toFixed(1)}% of fees</div>
            </div>
          ))}
        </div>
      </div>
      <div className="waterfall-grid">
        <div className="waterfall-card">
          <h3>Settlement waterfall</h3>
          <div className="sub">
            The order never changes, and every step is reconstructed from on-chain settlement events.
          </div>
          <div className="waterfall-steps">
            {steps.map((s) => (
              <div className="wf-step" key={s[0]}>
                <div className="wf-n">{s[0]}</div>
                <div className="wf-l">{s[1]}</div>
                <div className="wf-v">{fmt(s[2])}</div>
                <div className="wf-note">{s[3]}</div>
              </div>
            ))}
          </div>
        </div>
        <article
          className="surplus-card"
          tabIndex={0}
          role="button"
          aria-label="View Surplus Vault proof"
          onClick={onSurplusProof}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSurplusProof();
            }
          }}
        >
          <div className="surplus-head">
            <div>
              <h3>Surplus Vault</h3>
              <div className="sub">Protocol safety reserve funded only after IL and user payouts.</div>
            </div>
            <span className="proof">VIEW PROOF ↗</span>
          </div>
          <div className="surplus-label">Cumulative top-ups since launch</div>
          <div className="surplus-balance">{fmt(lifetimeSurplus)}</div>
          <div className="surplus-period">+{fmt(d.surplusVault)} this period</div>
          <details className="card-more" onClick={(e) => e.stopPropagation()}>
            <summary>How it’s funded</summary>
            <div className="more-body">
              <div className="surplus-rule">
                <b>70% of remaining surplus</b> goes to this vault. The other <b>30%</b> goes to the
                protocol. Funds here are never POL — this is an emergency reserve, and its future use
                will be decided by Balcore token holders.
              </div>
            </div>
          </details>
        </article>
      </div>
    </>
  );
}
