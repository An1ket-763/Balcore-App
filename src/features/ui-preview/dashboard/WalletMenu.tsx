import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { shortenAddress } from "./walletUtils";

/**
 * Top-right wallet button + dropdown, driven by the real wagmi connection.
 */
export default function WalletMenu({ onConnectClick }: { onConnectClick: () => void }) {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const short = shortenAddress(address);

  return (
    <div className="wallet-wrap" ref={wrapRef}>
      <button
        className={`wallet${open ? " open" : ""}${isConnected ? "" : " disconnected"}`}
        id="walletBtn"
        aria-haspopup="true"
        aria-expanded={open ? "true" : "false"}
        onClick={(e) => {
          e.stopPropagation();
          if (isConnected) setOpen((v) => !v);
          else onConnectClick();
        }}
      >
        <span
          className="live-dot"
          style={isConnected ? undefined : { background: "var(--text-3)", boxShadow: "none", animation: "none" }}
        ></span>
        {isConnected ? short : "Connect wallet"}
        <svg className="wallet-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`wallet-menu${open ? " open" : ""}`} id="walletMenu" role="menu">
        <div className="wallet-menu-head">
          <div className="wm-label">Connected wallet</div>
          <div className="wm-addr mono">{short}</div>
          <div className="wm-net">
            <span className="live-dot"></span>
            {chain?.name ?? "Avalanche Fuji"}
          </div>
        </div>
        <button
          className="wallet-menu-item"
          id="copyAddr"
          role="menuitem"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(address ?? "");
            } catch {
              /* clipboard unavailable */
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
            <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span id="copyLabel">{copied ? "Copied ✓" : "Copy address"}</span>
        </button>
        <a
          className="wallet-menu-item"
          id="explorerWallet"
          href={`https://testnet.snowtrace.io/address/${address ?? ""}`}
          target="_blank"
          rel="noopener"
          role="menuitem"
          title="See this wallet on the block explorer"
        >
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
            <path d="M8.5 8.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM3.2 14c.7-2.3 2.8-3.6 5.3-3.6s4.6 1.3 5.3 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          My wallet on the explorer
          <svg width="12" height="12" viewBox="0 0 17 17" fill="none" style={{ marginLeft: "auto", opacity: ".5" }}>
            <path d="M7 3H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V9M9.5 2.5H14V7M14 2.5 7.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <button
          className="wallet-menu-item danger"
          id="disconnectBtn"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            disconnect();
          }}
        >
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
            <path d="M6.5 2.5H4A1.5 1.5 0 0 0 2.5 4v9A1.5 1.5 0 0 0 4 14.5h2.5M11 11l3-2.5L11 6M6 8.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Disconnect
        </button>
      </div>
    </div>
  );
}
