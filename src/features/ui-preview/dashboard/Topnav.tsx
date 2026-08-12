import { LOGO } from "./logo";
import WalletMenu from "./WalletMenu";
export default function Topnav() {
  return (
    <>
    <a className="m-brand" href="#" aria-label="Balcore home"><img src={LOGO} width="24" height="24" alt="" /> Balcore</a>
    <div className="topnav">
      <div className="search-bar">
        <svg className="search-ic" width="16" height="16" viewBox="0 0 17 17" fill="none"><circle cx="7.5" cy="7.5" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="m11.5 11.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <input type="text" id="poolSearch" placeholder="Search assets & pools" aria-label="Search assets and pools" autoComplete="off" />
        <span className="search-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
      </div>
      <div className="top-actions">
        <button className="theme-btn" id="themeToggle" data-theme-toggle={true} aria-label="Switch to light mode" aria-pressed="false" title="Toggle theme"><svg className="ic-sun" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><svg className="ic-moon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 9.5A6 6 0 0 1 6.5 2.5 6 6 0 1 0 13.5 9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></button>
        <div className="width-toggle" id="widthToggle" role="group" aria-label="Layout width">
          <button data-w="fit" className="on" title="Centered" aria-label="Centered width"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="8" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.4" /></svg></button>
          <button data-w="wide" title="Wide" aria-label="Wide width"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.4" /></svg></button>
        </div>
        <button className="swap-btn" id="swapBtn">
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M4 5.5h9M10.5 3l2.5 2.5-2.5 2.5M13 11.5H4M6.5 9 4 11.5 6.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Swap
        </button>
        <button className="swap-btn" id="bridgeBtn" title="Bridge USDC via Circle CCTP">
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M1.6 12.4h13.8M5 12.4V3.8M12 12.4V3.8M5 4.6q3.5 4.6 7 0M1.6 8.6 5 5.4M15.4 8.6 12 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Bridge
        </button>
        <div className="wallet-wrap">
          <button className="wallet" id="walletBtn" aria-haspopup="true" aria-expanded="false">
            <span className="live-dot"></span>0xdeA…db3
            <svg className="wallet-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="wallet-menu" id="walletMenu" role="menu">
            <div className="wallet-menu-head">
              <div className="wm-label">Connected wallet</div>
              <div className="wm-addr mono">0xdeA7…c4Bf9db3</div>
              <div className="wm-net"><span className="live-dot"></span>Avalanche C-Chain</div>
            </div>
            <button className="wallet-menu-item" id="copyAddr" role="menuitem">
              <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.4" /></svg>
              <span id="copyLabel">Copy address</span>
            </button>
            <a className="wallet-menu-item" id="explorerWallet" href="#" target="_blank" rel="noopener" role="menuitem" title="See this wallet's deposits, earnings and IL coverage on the Balcore Explorer">
              <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M8.5 8.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM3.2 14c.7-2.3 2.8-3.6 5.3-3.6s4.6 1.3 5.3 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              My wallet on Balcore Explorer
              <svg width="12" height="12" viewBox="0 0 17 17" fill="none" style={{marginLeft: "auto", opacity: ".5"}}><path d="M7 3H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V9M9.5 2.5H14V7M14 2.5 7.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a className="wallet-menu-item" id="explorerProtocol" href="#" target="_blank" rel="noopener" role="menuitem" title="See the whole protocol \u2014 holdings, money flow, ownership and proof \u2014 on the Balcore Explorer">
              <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M2.5 6.5 8.5 3l6 3.5M3.5 6.5v6M13.5 6.5v6M6.3 8v4.5M10.7 8v4.5M2 13.8h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Balcore Explorer
              <svg width="12" height="12" viewBox="0 0 17 17" fill="none" style={{marginLeft: "auto", opacity: ".5"}}><path d="M7 3H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V9M9.5 2.5H14V7M14 2.5 7.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <button className="wallet-menu-item danger" id="disconnectBtn" role="menuitem">
              <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M6.5 2.5H4A1.5 1.5 0 0 0 2.5 4v9A1.5 1.5 0 0 0 4 14.5h2.5M11 11l3-2.5L11 6M6 8.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
