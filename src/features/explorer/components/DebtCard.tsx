import { DEBT, fmt } from "../data";

export default function DebtCard({ onProof }: { onProof: () => void }) {
  const total = DEBT.positions.reduce((a, p) => a + p.borrowed, 0);
  if (total <= 0) return null;
  const minHf = Math.min(...DEBT.positions.map((p) => p.hf));
  const pct = Math.min(94, Math.max(24, 24 + (minHf - 1) * 32));
  const net = 24600000 - total;

  return (
    <div className="debt-card">
      <div className="debt-col">
        <div className="l">Borrowed capital</div>
        <div className="v">{fmt(total)}</div>
        <div className="debt-venues">
          {DEBT.positions.map((p) => (
            <span key={p.venue} style={{ display: "contents" }}>
              <span>
                {p.venue}{" "}
                <b>
                  ${(p.borrowed / 1e6).toFixed(1)}M {p.asset}
                </b>{" "}
                · HF <b>{p.hf.toFixed(2)}</b>
              </span>
              <span className="debt-sub">
                ↳ {p.collateral} collateral → {p.deployed}
              </span>
            </span>
          ))}
        </div>
        <div className="debt-note" style={{ marginTop: 8 }}>
          <b>Shock absorber, not leverage</b> — inventory for the other side of one-sided moves.
        </div>
      </div>
      <div className="debt-col">
        <div className="l">
          Health factor · lowest venue{" "}
          <span
            className="proof"
            style={{ float: "right", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onProof();
            }}
          >
            VIEW PROOF ↗
          </span>
        </div>
        <div className="hf-scale">
          <span className="hf-mark" style={{ left: "24%" }} />
          <span className="hf-lab" style={{ left: "24%" }}>
            1.0 liq
          </span>
          <span className="hf-mark" style={{ left: "40%", background: "var(--gold)" }} />
          <span className="hf-lab" style={{ left: "40%" }}>
            {DEBT.floor.toFixed(2)} floor
          </span>
          <span className="hf-mark" style={{ left: `${pct}%`, background: "var(--mint)" }} />
          <span className="hf-now" style={{ left: `${pct}%` }}>
            {minHf.toFixed(2)} now
          </span>
        </div>
        <div className="debt-note">
          Read live from each venue. <b>Never below {DEBT.floor.toFixed(2)}</b> — auto-deleverage
          before the floor; repaid as the market normalizes.
        </div>
      </div>
      <div className="debt-col">
        <div className="l">Net assets · after debt</div>
        <div className="v" style={{ color: "var(--mint)" }}>
          {fmt(net)}
        </div>
        <div className="debt-note" style={{ marginTop: 6 }}>
          <b style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>
            {fmt(24600000)} tracked − {fmt(total)} borrowed = {fmt(net)}
          </b>
          <br />
          <b>Nothing owed is hidden.</b>
        </div>
      </div>
    </div>
  );
}
