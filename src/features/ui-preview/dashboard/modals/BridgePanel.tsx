import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Bridge modal.
 *
 * This is a STRAIGHT PORT of the imperative block that used to live in
 * dashboardScripts.ts under "bridge logic (Circle CCTP v2 mock)". Markup,
 * classnames, ids, copy, timings and behaviour are all deliberately unchanged
 * — the only difference is that React now owns the state instead of the DOM.
 *
 * The move exists so the panel can use wagmi hooks, which imperative script
 * cannot. The transfer itself is STILL SIMULATED: the timers and invented
 * transaction hashes below are the original mock, kept as-is so this change
 * can be verified as a no-op before any real money logic lands on top.
 *
 * The `#ovBridge` overlay wrapper, and opening/closing it, stay in
 * dashboardScripts.ts — same split as SwapPanel.
 */

/** Chain logo marks (inline SVG, brand colors). Verbatim from the original. */
const LOGOS: Record<string, string> = {
  Ethereum:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path d="M16 5v8.13l6.87 3.07L16 5Z" fill="#fff" opacity=".6"/><path d="M16 5 9.13 16.2 16 13.13V5Z" fill="#fff"/><path d="M16 21.97V27l6.88-9.52L16 21.97Z" fill="#fff" opacity=".6"/><path d="M16 27v-5.03l-6.87-4.49L16 27Z" fill="#fff"/><path d="m16 20.69 6.87-4.49L16 13.14v7.55Z" fill="#fff" opacity=".25"/><path d="m9.13 16.2 6.87 4.49v-7.55L9.13 16.2Z" fill="#fff" opacity=".6"/></svg>',
  Base: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0052FF"/><path d="M16 26.5c5.8 0 10.5-4.7 10.5-10.5S21.8 5.5 16 5.5C10.5 5.5 6 9.72 5.55 15.1h13.9v1.8H5.55C6 22.28 10.5 26.5 16 26.5Z" fill="#fff"/></svg>',
  Arbitrum:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#213147"/><path d="m16 6 8.4 14.6-2.6 1.5L16 11.2l-5.8 10.9-2.6-1.5L16 6Z" fill="#9DCCED"/><path d="m13.4 18.7 2.6-4.9 2.6 4.9-2.6 6.1-2.6-6.1Z" fill="#12AAFF"/></svg>',
  "OP Mainnet":
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#FF0420"/><text x="16" y="20.6" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="11.5" fill="#fff">OP</text></svg>',
  Polygon:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#8247E5"/><path d="M21.1 12.9c-.36-.21-.83-.21-1.23 0l-2.85 1.68-1.93 1.07-2.8 1.68c-.36.21-.83.21-1.23 0l-2.18-1.32a1.25 1.25 0 0 1-.61-1.07v-2.53c0-.43.22-.83.61-1.07l2.18-1.25c.36-.21.83-.21 1.23 0l2.18 1.3c.36.21.61.64.61 1.07v1.68l1.93-1.14v-1.71c0-.43-.22-.83-.61-1.07l-4.06-2.39c-.36-.21-.83-.21-1.23 0L7 11.26c-.4.21-.61.64-.61 1.04v4.78c0 .43.22.83.61 1.07l4.1 2.39c.36.21.83.21 1.23 0l2.8-1.64 1.93-1.11 2.8-1.64c.36-.21.83-.21 1.23 0l2.18 1.25c.36.21.61.64.61 1.07v2.53c0 .43-.22.83-.61 1.07l-2.14 1.28c-.36.21-.83.21-1.23 0l-2.18-1.25a1.25 1.25 0 0 1-.61-1.07v-1.64l-1.93 1.14v1.68c0 .43.22.83.61 1.07l4.1 2.39c.36.21.83.21 1.23 0l4.1-2.39c.36-.21.61-.64.61-1.07v-4.82c0-.43-.22-.83-.61-1.07l-4.12-2.42Z" fill="#fff"/></svg>',
  Solana:
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="solg" x1="6" y1="26" x2="26" y2="6" gradientUnits="userSpaceOnUse"><stop stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#0d0d15"/><path d="M10.4 19.9c.13-.13.3-.2.49-.2h11.5c.31 0 .46.37.24.59l-2.53 2.5a.7.7 0 0 1-.49.2H8.11a.34.34 0 0 1-.24-.59l2.53-2.5Zm0-10.7c.13-.13.3-.2.49-.2h11.5c.31 0 .46.37.24.59l-2.53 2.5a.7.7 0 0 1-.49.2H8.11a.34.34 0 0 1-.24-.59l2.53-2.5Zm11.2 5.32a.7.7 0 0 0-.49-.2H9.61a.34.34 0 0 0-.24.59l2.53 2.5c.13.13.3.2.49.2h11.5c.31 0 .46-.37.24-.59l-2.53-2.5Z" fill="url(#solg)"/></svg>',
  "Avalanche C-Chain":
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#E84142"/><polygon points="16,7 19.2,12.7 14.0,22 7.6,22" fill="#fff"/><polygon points="20.9,16.5 24.4,22 17.9,22" fill="#fff"/></svg>',
  "Robinhood Chain":
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#00C805"/><path d="M21.7 7.9c-5.6 1.5-9.7 5.5-11.6 11.6l-1.6 5 .9-.3 4.2-1.5c5.7-2.1 9.2-6.6 9.7-12.6l.2-2.4-1.8.2Zm-8.9 12.9c1.5-4.6 4.4-7.7 8.4-9.2-.8 4.4-3.5 7.6-7.6 9.1l-1.2.4.4-.3Z" fill="#fff"/></svg>',
  NEAR: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0f1014"/><polygon points="9.5,8.5 12.5,8.5 12.5,23.5 9.5,23.5" fill="#fff"/><polygon points="19.5,8.5 22.5,8.5 22.5,23.5 19.5,23.5" fill="#fff"/><polygon points="9.5,8.5 12.5,8.5 22.5,23.5 19.5,23.5" fill="#fff"/></svg>',
};

/** Illustrative fast-fee bps by source chain. Replaced by Circle's fee API later. */
const FAST_BPS: Record<string, number> = {
  Ethereum: 1,
  Base: 1,
  Arbitrum: 1,
  "OP Mainnet": 1,
  Polygon: 1,
  Solana: 2,
  Avalanche: 1,
};

/** Still the hardcoded figure from the original markup — replaced next step. */
const MOCK_BALANCE = 14200;

const CHIPS: { chain: string; label: string; soon?: string }[] = [
  { chain: "Ethereum", label: "Ethereum" },
  { chain: "Base", label: "Base" },
  { chain: "Arbitrum", label: "Arbitrum" },
  { chain: "Polygon", label: "Polygon" },
  { chain: "Solana", label: "Solana" },
  {
    chain: "NEAR",
    label: "NEAR",
    soon: "Native USDC is live on NEAR — route opens when Circle connects NEAR to CCTP",
  },
  {
    chain: "Robinhood Chain",
    label: "Robinhood",
    soon: "Robinhood Chain mainnet is live — route opens when Circle ships native USDC / CCTP support",
  },
];

type Phase = "edit" | "review" | "bridging" | "done";
type Speed = "fast" | "standard";
type StepState = "" | "active" | "done";

interface Step {
  title: string;
  sub: string;
  state: StepState;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Invented hash for the simulated flow. Not a real transaction. */
function mockTx(chain: string): string {
  const hex = "0123456789abcdef";
  const b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return chain === "Solana"
    ? `${pick(b58, 4)}…${pick(b58, 4)}`
    : `0x${pick(hex, 6)}…${pick(hex, 4)}`;
}

function ChainMark({ name, id }: { name: string; id?: string }) {
  return <span className="br-ic" id={id} dangerouslySetInnerHTML={{ __html: LOGOS[name] ?? "" }} />;
}

export default function BridgePanel() {
  const [other, setOther] = useState("Ethereum");
  const [toAvax, setToAvax] = useState(true);
  const [speed, setSpeed] = useState<Speed>("fast");
  const [amount, setAmount] = useState("");
  const [activePct, setActivePct] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [flipSpin, setFlipSpin] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [doneAmt, setDoneAmt] = useState("");
  const [donePrimaryLabel, setDonePrimaryLabel] = useState("Done");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const amtRef = useRef<HTMLInputElement>(null);

  const fromChain = toAvax ? other : "Avalanche C-Chain";
  const toChain = toAvax ? "Avalanche C-Chain" : other;
  const srcLabel = toAvax ? other : "Avalanche";
  const dstLabel = toAvax ? "Avalanche" : other;

  const value = parseFloat((amount || "").replace(/,/g, "")) || 0;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const resetFlow = useCallback(() => {
    clearTimers();
    setPhase((prev) => {
      if (prev === "bridging" || prev === "done") {
        setAmount("");
        setActivePct(null);
      }
      return "edit";
    });
    setSteps([]);
    setDoneAmt("");
  }, [clearTimers]);

  // Reset whenever the overlay closes — the wrapper is still owned by
  // dashboardScripts.ts, so its class is the only signal we get.
  useEffect(() => {
    const overlay = document.getElementById("ovBridge");
    if (!overlay) return;
    const observer = new MutationObserver(() => {
      if (!overlay.classList.contains("open")) resetFlow();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [resetFlow]);

  useEffect(() => clearTimers, [clearTimers]);

  /** Editing anything after review drops back to the editable state. */
  function touch() {
    if (phase === "review") setPhase("edit");
  }

  // ---- quote ----
  const fastFee = useMemo(() => {
    if (speed !== "fast" || value <= 0) return null;
    return Math.max((value * (FAST_BPS[srcLabel] ?? 1)) / 10000, 0.01);
  }, [speed, value, srcLabel]);

  const receiveText =
    value > 0
      ? speed === "fast"
        ? `${money(value - (fastFee ?? 0))} USDC`
        : `${money(value)} USDC`
      : "—";

  const feeText =
    speed === "fast"
      ? value > 0
        ? `≈ ${(fastFee ?? 0).toFixed(2)} USDC · Fast Transfer`
        : "Fast Transfer · quoted at bridge time"
      : "None · Standard Transfer";

  const etaText =
    speed === "fast"
      ? "~30 seconds"
      : srcLabel === "Ethereum"
        ? "~15–20 minutes (finality)"
        : "~1–5 minutes (finality)";

  const title = toAvax ? "Bridge USDC to Balcore" : "Bridge USDC out";
  const subtitle = toAvax
    ? "Bring USDC in from any chain — then deposit and start market making."
    : "Move USDC from Avalanche back to any supported chain. Your funds, your call.";

  const ctaDisabled = value <= 0;
  const ctaLabel =
    value <= 0 ? "Enter an amount" : phase === "review" ? "Confirm bridge" : "Review bridge";

  const reviewNote =
    phase === "review"
      ? `Bridging ${money(value)} USDC · ${srcLabel} → ${dstLabel} · ${speed === "fast" ? "Fast ~30s" : "Standard"}`
      : "";

  // ---- simulated burn → attest → mint ----
  function startBridge() {
    setPhase("bridging");
    const fast = speed === "fast";
    const got = receiveText;
    setSteps([
      { title: `Burn on ${srcLabel}`, sub: "Submitting transaction…", state: "active" },
      {
        title: `Circle attestation${fast ? " · Fast" : ""}`,
        sub: fast ? "Iris signing at confirmed level…" : "Waiting for source-chain finality…",
        state: "",
      },
      { title: `Mint on ${dstLabel}`, sub: "Queued", state: "" },
    ]);

    const d = fast ? [1300, 1700, 1300] : [1500, 3400, 1500];
    timers.current.push(
      setTimeout(() => {
        setSteps((s) =>
          s.map((step, i) =>
            i === 0
              ? { ...step, state: "done", sub: `tx ${mockTx(srcLabel)} · confirmed` }
              : i === 1
                ? { ...step, state: "active" }
                : step,
          ),
        );
      }, d[0]),
    );
    timers.current.push(
      setTimeout(
        () => {
          setSteps((s) =>
            s.map((step, i) =>
              i === 1
                ? { ...step, state: "done", sub: "attestation signed ✓" }
                : i === 2
                  ? { ...step, state: "active", sub: "Delivering native USDC…" }
                  : step,
            ),
          );
        },
        (d[0] ?? 0) + (d[1] ?? 0),
      ),
    );
    timers.current.push(
      setTimeout(
        () => {
          setSteps((s) =>
            s.map((step, i) =>
              i === 2 ? { ...step, state: "done", sub: `tx ${mockTx(dstLabel)} · minted` } : step,
            ),
          );
          setDoneAmt(`${got} arrived on ${dstLabel}`);
          setDonePrimaryLabel(toAvax ? "Deposit & start market making" : "Done");
          setPhase("done");
        },
        (d[0] ?? 0) + (d[1] ?? 0) + (d[2] ?? 0),
      ),
    );
  }

  function onCta() {
    if (ctaDisabled) return;
    if (phase === "edit") setPhase("review");
    else if (phase === "review") startBridge();
  }

  function setPct(pct: number) {
    const v = (MOCK_BALANCE * pct) / 100;
    setAmount(String(Math.floor(v * 100) / 100));
    setActivePct(pct);
    touch();
  }

  const bridging = phase === "bridging" || phase === "done";

  return (
    <div className={`modal bridge-modal${bridging ? " bridging" : ""}`}>
      <div className="m-head">
        <h2 id="bridgeTitle">{title}</h2>
        <button className="m-close" data-close={true} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="br-subtitle" id="brSubtitle">
        {subtitle}
      </p>

      <div className="br-dir">
        <div className="br-chain glow-from">
          <ChainMark name={fromChain} id="brFromIc" />
          <div className="br-meta">
            <div className="br-lbl">
              {fromChain === "Avalanche C-Chain" ? "From · C-Chain" : "From"}
            </div>
            <div className="br-name" id="brFromName">
              {fromChain === "Avalanche C-Chain" ? "Avalanche" : fromChain}
            </div>
          </div>
        </div>
        <div className="br-link">
          <div className="br-line"></div>
          <div className="br-pulse"></div>
          <button
            className={`br-swap-dir${flipSpin ? " spin" : ""}`}
            id="brFlip"
            aria-label="Reverse bridge direction"
            title="Reverse direction"
            onClick={() => {
              if (bridging) return;
              setToAvax((v) => !v);
              setFlipSpin((v) => !v);
              touch();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
              <path
                d="M4 5.5h9M10.5 3l2.5 2.5-2.5 2.5M13 11.5H4M6.5 9 4 11.5 6.5 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="br-chain glow-to">
          <ChainMark name={toChain} id="brToIc" />
          <div className="br-meta">
            <div className="br-lbl">{toChain === "Avalanche C-Chain" ? "To · C-Chain" : "To"}</div>
            <div className="br-name" id="brToName">
              {toChain === "Avalanche C-Chain" ? "Avalanche" : toChain}
            </div>
          </div>
        </div>
      </div>

      <div className="br-chips" id="brChips" role="group" aria-label="Select the other chain">
        {CHIPS.map((chip) => (
          <button
            key={chip.chain}
            className={`br-chip${chip.soon ? " soon" : other === chip.chain ? " on" : ""}`}
            data-chain={chip.chain}
            aria-disabled={chip.soon ? true : undefined}
            title={chip.soon}
            onClick={() => {
              if (chip.soon) return;
              setOther(chip.chain);
              touch();
            }}
          >
            <span className="bc-ic" dangerouslySetInnerHTML={{ __html: LOGOS[chip.chain] ?? "" }} />
            {chip.label}
            {chip.soon ? <span className="bc-soon">Soon</span> : null}
          </button>
        ))}
      </div>

      <div className="swap-field">
        <div className="swap-field-top">
          <span>Amount</span>
          <span>
            Balance:{" "}
            <span className="mono" style={{ color: "var(--text-2)" }} id="brBal">
              {MOCK_BALANCE.toLocaleString()} USDC
            </span>
          </span>
        </div>
        <div className="swap-pct" id="brPct">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              className={`swap-pct-btn${activePct === p ? " on" : ""}`}
              data-pct={p}
              type="button"
              onClick={() => setPct(p)}
            >
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
        <div className="swap-field-row">
          <input
            ref={amtRef}
            id="brAmt"
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount of USDC to bridge"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setActivePct(null);
              touch();
            }}
          />
          <button className="token-pick" style={{ cursor: "default" }} tabIndex={-1}>
            <span className="coin c-usd">$</span>USDC
          </button>
        </div>
      </div>

      <div className="br-speed" role="group" aria-label="Transfer speed">
        <button
          className={`br-speed-opt${speed === "fast" ? " on" : ""}`}
          data-speed="fast"
          onClick={() => {
            setSpeed("fast");
            touch();
          }}
        >
          <div className="bs-t">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M9 1.5 3.5 9H7l-1 5.5L11.5 7H8l1-5.5Z" fill="currentColor" />
            </svg>
            Fast
          </div>
          <div className="bs-s">~30 seconds · small fee</div>
        </button>
        <button
          className={`br-speed-opt${speed === "standard" ? " on" : ""}`}
          data-speed="standard"
          onClick={() => {
            setSpeed("standard");
            touch();
          }}
        >
          <div className="bs-t">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 4.8V8l2.2 1.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Standard
          </div>
          <div className="bs-s">Waits for finality · no protocol fee</div>
        </button>
      </div>

      <div className="swap-rows m-rows">
        <div className="m-row">
          <span className="k">Route</span>
          <span className="v">Circle CCTP v2 · native burn &amp; mint</span>
        </div>
        <div className="m-row">
          <span className="k">You receive</span>
          <span className="v mono" id="brRecv">
            {receiveText}
          </span>
        </div>
        <div className="m-row">
          <span className="k">Bridge fee</span>
          <span className="v" id="brFee">
            {feeText}
          </span>
        </div>
        <div className="m-row">
          <span className="k">Est. time</span>
          <span className="v" id="brEta">
            {etaText}
          </span>
        </div>
      </div>

      <div className="br-pipe" aria-hidden="true">
        <span className="bp">Burn</span>
        <span className="bp-arrow">→</span>
        <span className="bp">Attest</span>
        <span className="bp-arrow">→</span>
        <span className="bp">Mint</span>
      </div>

      <div className="br-review" id="brReviewNote" hidden={phase !== "review"}>
        {reviewNote}
      </div>
      <button className="cta" id="brCta" aria-live="polite" disabled={ctaDisabled} onClick={onCta}>
        {ctaLabel}
      </button>

      <div className="br-progress" id="brProgress" hidden={!bridging} aria-live="polite">
        <div id="brSteps">
          {steps.map((step, i) => (
            <div className={`br-step${step.state ? ` ${step.state}` : ""}`} data-i={i} key={i}>
              <span className="st-ic">
                <span className="st-slot">
                  {step.state === "active" ? (
                    <span className="br-spinner"></span>
                  ) : step.state === "done" ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12.5 10 17.5 19 7.5"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
              </span>
              <div>
                <div className="st-t">{step.title}</div>
                <div className="st-s">{step.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="br-done" id="brDone" hidden={phase !== "done"}>
          <div className="bd-ic">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5 10 17.5 19 7.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 id="brDoneTitle">Bridge complete</h3>
          <div className="bd-amt" id="brDoneAmt">
            {doneAmt}
          </div>
          <button
            className="cta"
            id="brDonePrimary"
            onClick={() => {
              const wasIn = donePrimaryLabel.indexOf("Deposit") === 0;
              document.querySelector<HTMLElement>("#ovBridge [data-close]")?.click();
              if (wasIn) document.getElementById("navDeposit")?.click();
            }}
          >
            {donePrimaryLabel}
          </button>
          <button
            className="br-again"
            id="brAgain"
            onClick={() => {
              resetFlow();
              setAmount("");
              setActivePct(null);
              amtRef.current?.focus();
            }}
          >
            Bridge again
          </button>
        </div>
      </div>
    </div>
  );
}
