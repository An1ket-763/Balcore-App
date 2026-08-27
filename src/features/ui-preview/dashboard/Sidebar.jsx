import { useAccount } from "wagmi";
import { defaultChain } from "@/lib/wagmi";
import { LOGO } from "./logo";
import { useTokenBalances } from "./data/balances";
import { getTokenPrices } from "./data/prices";
import { shortenAddress } from "./walletUtils";


function fmtCompactUsd(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return "$" + (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const CIRCUMFERENCE = 213.6;

const BUCKETS = [
  { key: "USDC", label: "Dollar", color: "#2fa96e" },
  { key: "BTC", label: "Bitcoin", color: "#f7931a" },
  { key: "TSLA", label: "Tesla", color: "#d63031" },
  { key: "GOLD", label: "Gold", color: "#d9b24a" },
];

export default function Sidebar({ displayName = "", open = false, onClose = () => {} }) {
  const { isConnected, chain, address } = useAccount();
  const identityLabel = displayName.trim() || shortenAddress(address);

  const wrongNetwork = isConnected && chain?.id !== defaultChain.id;

  const { balances, isLoading } = useTokenBalances();
  const prices = getTokenPrices();

  const disabledLinkProps = wrongNetwork
    ? { "aria-disabled": true, title: "Switch to Avalanche Fuji to use this", style: { opacity: 0.45, pointerEvents: "none" }, onClick: (e) => e.preventDefault() }
    : {};

  const values = BUCKETS.map((b) => balances[b.key] * (prices[b.key]?.usd ?? 0));
  const total = values.reduce((s, v) => s + v, 0);

  let runningOffset = 0;
  const segments = BUCKETS.map((bucket, i) => {
    const value = values[i];
    const pct = total > 0 ? (value / total) * 100 : 0;
    const arc = (pct / 100) * CIRCUMFERENCE;
    const segment = {
      ...bucket,
      value,
      pct,
      arc,
      dashArray: `${arc} ${CIRCUMFERENCE}`,
      offset: -runningOffset,
    };
    runningOffset += arc;
    return segment;
  });

  const ariaLabel =
    "Portfolio allocation: " +
    segments.map((s) => `${s.label.toLowerCase()} ${Math.round(s.pct)}%`).join(", ");

  return (
    <>
  <aside className={`side${open ? " open" : ""}`} id="sideNav" aria-label="Main navigation">
    <button className="side-close" type="button" aria-label="Close navigation menu" onClick={onClose}>✕</button>
    <a className="logo" href="#">
      <img src={LOGO} width="26" height="26" alt="" style={{display: "block"}} />
      Balcore
    </a>

    <div className="nav-group" onClick={onClose}>
      <div className="lbl">Menu</div>
      <a className="nav-item active" href="#" data-view="overview">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><rect x="2" y="2" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="9.5" y="2" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="2" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /></svg>
        Overview
      </a>
      <a className="nav-item" href="#" id="navDeposit" {...disabledLinkProps}>
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 12.5v-10M4.5 6.5l4-4 4 4M2.5 14.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Deposit
      </a>
      <a className="nav-item" href="#" id="navWithdraw" {...disabledLinkProps}>
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 2.5v10M4.5 8.5l4 4 4-4M2.5 14.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Withdraw
      </a>
      <a className="nav-item" href="#" data-view="protocol">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 1.5 15 5 8.5 8.5 2 5 8.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M2 8.5 8.5 12 15 8.5M2 11.5 8.5 15 15 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        Protocol
      </a>
      <a className="nav-item" href="#" data-view="activity">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M8.5 5v3.5l2.4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        Activity
      </a>
    </div>

    <div className="side-card">
      <div className="card-label" style={{marginBottom: "14px"}}>Portfolio</div>
      <div className={`donut-wrap${isLoading ? " is-loading" : ""}`} aria-busy={isLoading}>
        <svg className="donut-svg" width="86" height="86" viewBox="0 0 86 86" role="img" aria-label={ariaLabel}>
          <circle cx="43" cy="43" r="34" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="11" />
          {segments.map((s, i) => (
            <circle
              key={s.key}
              className="pf-seg"
              data-seg={i}
              data-name={s.label}
              data-pct={`${Math.round(s.pct)}%`}
              data-val={fmtCompactUsd(s.value)}
              data-color={s.color}
              cx="43"
              cy="43"
              r="34"
              fill="none"
              stroke={s.color}
              strokeWidth="11"
              strokeDasharray={s.dashArray}
              strokeDashoffset={s.offset}
              transform="rotate(-90 43 43)"
            >
              <title>{`${s.label} · ${Math.round(s.pct)}% · ${fmtCompactUsd(s.value)}`}</title>
            </circle>
          ))}
          <text className="pf-cval" x="43" y="40" textAnchor="middle" fontFamily="IBM Plex Mono,monospace" fontSize="13" fontWeight="500">
            {isLoading ? "…" : fmtCompactUsd(total)}
          </text>
          <text className="pf-clab" x="43" y="53" textAnchor="middle" fontFamily="IBM Plex Sans,sans-serif" fontSize="9">total</text>
        </svg>
        <div className="legend">
          {segments.map((s, i) => (
            <div key={s.key} className="row" data-seg={i}>
              <span className="name">
                <span className="dot" style={{background: s.color}}></span>
                {s.label}
              </span>
              <b>{isLoading ? <span className="is-loading">…</span> : `${Math.round(s.pct)}%`}</b>
            </div>
          ))}
        </div>
      </div>
    </div>

  </aside>
    </>
  );
}
