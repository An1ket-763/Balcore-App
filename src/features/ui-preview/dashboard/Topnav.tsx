import { LOGO } from "./logo";
import WalletMenu from "./WalletMenu";
export default function Topnav({ onConnectClick }: { onConnectClick: () => void }) {
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
        <button className="swap-btn" id="swapBtn">
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M4 5.5h9M10.5 3l2.5 2.5-2.5 2.5M13 11.5H4M6.5 9 4 11.5 6.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Swap
        </button>
        <button className="swap-btn" id="bridgeBtn" title="Bridge USDC via Circle CCTP">
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M1.6 12.4h13.8M5 12.4V3.8M12 12.4V3.8M5 4.6q3.5 4.6 7 0M1.6 8.6 5 5.4M15.4 8.6 12 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Bridge
        </button>
        <WalletMenu onConnectClick={onConnectClick} />
      </div>
    </div>
    </>
  );
}
