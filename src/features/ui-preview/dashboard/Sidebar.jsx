import { LOGO } from "./logo";
export default function Sidebar() {
  return (
    <>
  <aside className="side">
    <a className="logo" href="#">
      <img src={LOGO} width="26" height="26" alt="" style={{display: "block"}} />
      Balcore
    </a>

    <div className="nav-group">
      <div className="lbl">Menu</div>
      <a className="nav-item active" href="#" data-view="overview">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><rect x="2" y="2" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="9.5" y="2" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="2" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" /></svg>
        Overview
      </a>
      <a className="nav-item" href="#" id="navDeposit">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 12.5v-10M4.5 6.5l4-4 4 4M2.5 14.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Deposit
      </a>
      <a className="nav-item" href="#" id="navWithdraw">
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
      <div className="donut-wrap">
        <svg className="donut-svg" width="86" height="86" viewBox="0 0 86 86" role="img" aria-label="Portfolio allocation: dollars 50%, bitcoin 20%, tesla 17%, gold 13%">
          <circle cx="43" cy="43" r="34" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="11" />
          <circle className="pf-seg" data-seg="0" data-name="Dollar" data-pct="50%" data-val="$1.21M" data-color="#2fa96e" cx="43" cy="43" r="34" fill="none" stroke="#2fa96e" strokeWidth="11" strokeDasharray="106.8 213.6" transform="rotate(-90 43 43)" /><title>Dollar · 50% · $1.21M</title></circle>
          <circle className="pf-seg" data-seg="1" data-name="Bitcoin" data-pct="20%" data-val="$484K" data-color="#f7931a" cx="43" cy="43" r="34" fill="none" stroke="#f7931a" strokeWidth="11" strokeDasharray="42.7 213.6" strokeDashoffset="-106.8" transform="rotate(-90 43 43)" /><title>Bitcoin · 20% · $484K</title></circle>
          <circle className="pf-seg" data-seg="2" data-name="Tesla" data-pct="17%" data-val="$411K" data-color="#d63031" cx="43" cy="43" r="34" fill="none" stroke="#d63031" strokeWidth="11" strokeDasharray="36.3 213.6" strokeDashoffset="-149.5" transform="rotate(-90 43 43)" /><title>Tesla · 17% · $411K</title></circle>
          <circle className="pf-seg" data-seg="3" data-name="Gold" data-pct="13%" data-val="$314K" data-color="#d9b24a" cx="43" cy="43" r="34" fill="none" stroke="#d9b24a" strokeWidth="11" strokeDasharray="27.8 213.6" strokeDashoffset="-185.8" transform="rotate(-90 43 43)" /><title>Gold · 13% · $314K</title></circle>
          <text className="pf-cval" x="43" y="40" textAnchor="middle" fontFamily="IBM Plex Mono,monospace" fontSize="13" fontWeight="500">$2.4M</text>
          <text className="pf-clab" x="43" y="53" textAnchor="middle" fontFamily="IBM Plex Sans,sans-serif" fontSize="9">total</text>
        </svg>
        <div className="legend">
          <div className="row" data-seg="0"><span className="name"><span className="dot" style={{background: "#2fa96e"}}></span>Dollar</span><b>50%</b></div>
          <div className="row" data-seg="1"><span className="name"><span className="dot" style={{background: "#f7931a"}}></span>Bitcoin</span><b>20%</b></div>
          <div className="row" data-seg="2"><span className="name"><span className="dot" style={{background: "#d63031"}}></span>Tesla</span><b>17%</b></div>
          <div className="row" data-seg="3"><span className="name"><span className="dot" style={{background: "#d9b24a"}}></span>Gold</span><b>13%</b></div>
        </div>
      </div>
    </div>

    <div className="user">
      <div className="avatar" aria-hidden="true"></div>
      <div className="user-id">
        <b>{displayName || short || "Guest"}</b>
        <span>
          {isConnected ? `${short} · Connected` : "Not connected"}
          {isConnected && (
            <>
              {" · "}
              <button type="button" className="side-disconnect" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          )}
        </span>
      </div>
      <button className="user-settings" id="themeToggleSide" data-theme-toggle={true} aria-label="Switch to light mode" aria-pressed="false" title="Toggle theme">
        <svg className="ic-sun" width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <svg className="ic-moon" width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 9.5A6 6 0 0 1 6.5 2.5 6 6 0 1 0 13.5 9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      </button>
    </div>
  </aside>
    </>
  );
}
