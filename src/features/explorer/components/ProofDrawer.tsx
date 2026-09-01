import { useEffect, type ReactNode } from "react";

export interface ProofConfig {
  title: string;
  value?: string;
  range?: string;
  desc?: string;
  rows?: [string, string][];
  chart?: ReactNode;
  events?: [string, string][];
  recipe?: string;
  api?: string;
}

export default function ProofDrawer({
  proof,
  onClose,
  onCopy,
  onToast,
}: {
  proof: ProofConfig | null;
  onClose: () => void;
  onCopy: (text: string) => void;
  onToast: (msg: string) => void;
}) {
  const open = !!proof;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      <div className={`backdrop${open ? " open" : ""}`} onClick={onClose} />
      <aside
        className={`drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={open ? "false" : "true"}
        aria-labelledby="drawerTitle"
      >
        <button className="drawer-close" onClick={onClose} aria-label="Close proof">
          ✕
        </button>
        <div className="drawer-kicker">Proof path</div>
        <h2 id="drawerTitle">{proof?.title ?? ""}</h2>
        <div className="drawer-value">{proof?.value ?? ""}</div>
        <div className="drawer-range">{proof?.range ?? ""}</div>
        <p className="drawer-desc">{proof?.desc ?? ""}</p>
        <div className="proof-card">
          <h3>Reproduction recipe</h3>
          <div>
            {(proof?.rows ?? []).map((r, i) => (
              <div className="proof-row" key={i}>
                <span>{r[0]}</span>
                <span>{r[1]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="drawer-chart" id="drawerChart">
          {proof?.chart}
        </div>
        <div className="drawer-events">
          {(proof?.events ?? []).map((e, i) => (
            <div className="drawer-event" key={i}>
              <span className="l">{e[0]}</span>
              <span className="r">{e[1]}</span>
            </div>
          ))}
        </div>
        <div className="drawer-actions">
          <button
            className="btn primary"
            onClick={() => onToast("Demo only — production opens the exact proof")}
          >
            Open Snowtrace ↗
          </button>
          <button className="btn" onClick={() => onCopy(proof?.recipe ?? "")}>
            Copy recipe
          </button>
          <button className="btn" onClick={() => onCopy(proof?.api ?? "")}>
            Copy API query
          </button>
        </div>
      </aside>
    </>
  );
}
