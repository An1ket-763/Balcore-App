import { LOGO } from "@/features/ui-preview/dashboard/logo";

export default function Topbar({
  block,
  paused,
  onTogglePaused,
  onSearch,
  searchValue,
  onSearchValueChange,
}: {
  block: number;
  paused: boolean;
  onTogglePaused: () => void;
  onSearch: (query: string) => void;
  searchValue: string;
  onSearchValueChange: (v: string) => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src={LOGO} alt="Balcore logo" />
        <span>
          Balcore <small>Explorer</small>
        </span>
      </div>
      <div className="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          aria-label="Search wallet, transaction, position or epoch"
          placeholder="Search any wallet address · 0x…"
          value={searchValue}
          onChange={(e) => onSearchValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch((e.target as HTMLInputElement).value);
          }}
        />
        <span className="search-help">ENTER</span>
      </div>
      <div className="chain-actions">
        <button
          className={`live-control${paused ? " paused" : ""}`}
          type="button"
          aria-pressed={paused}
          aria-label={paused ? "Resume live prototype updates" : "Pause live prototype updates"}
          onClick={onTogglePaused}
        >
          {paused ? "Resume" : "Pause live"}
        </button>
        <div className="chain">
          <span className="live-dot" />
          Avalanche C-Chain · block{" "}
          <span key={block} className="block-flash">
            {block.toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  );
}
