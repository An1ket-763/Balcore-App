/**
 * The deposit modal, on the real contracts.
 *
 * Replaces the imperative `#ovDeposit` wiring that used to live in
 * `dashboardScripts.ts`, the same way `SwapPanel` and `BridgePanel` replaced
 * theirs: `Overlays.tsx` keeps the `.overlay` shell and the script keeps
 * open/close, focus-trap and nav-highlight duty. Everything inside the modal is
 * now React over `useDeposit`.
 *
 * EVERY CLASS NAME AND EVERY WRAPPER IS THE ONE THE DESIGN SHIPPED WITH. The
 * styling in `dashboard.css` is keyed off these exact names, and a front-end dev
 * has to be able to restyle this without reading TypeScript. Where the v1 truth
 * forced a copy change, the change is to the WORDS inside the existing element,
 * never to the element.
 *
 * THE BANK TAB IS CARRIED OVER VERBATIM and is still driven by
 * `dashboardScripts.ts` — an illustrative on-ramp flow with no contract behind
 * it, explicitly out of scope. It is rendered ALWAYS (toggled with
 * `style.display`, as the original did) rather than conditionally, because a
 * conditional render would unmount it and drop the script's listeners.
 *
 * THE EXCHANGE TAB IS NOW A COMING-SOON STATE. It used to print a deposit
 * address and a QR and invite people to send USDC to them; the address was a
 * hardcoded literal and the per-user deposit contracts behind it do not exist,
 * so the whole flow was replaced rather than left illustrative. See the comment
 * on `#depExchPanel` below.
 *
 * THE TWO GLOBALS STAY: `window.__balcoreDepChooser()` and
 * `window.__balcoreDepDirect(src)` are how the sidebar, the position modal and
 * the wallet modal drive this panel. They keep their names and their meaning;
 * only the implementation moved from DOM-poking to React state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { LOGO } from "../logo";
import {
  BALCORE_POOLS,
  nextTuesday00Z,
  useDeposit,
  useVaultStats,
  type BalcorePool,
  type InspectOptions,
  type PoolKey,
} from "@/lib/balcore";
import { explorerBase } from "@/lib/wagmi";

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const fmtUsd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** A token amount for display. BTC.b would round to nothing at 2 decimals. */
function fmtToken(atoms: bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(atoms, decimals));
  if (!Number.isFinite(n) || n === 0) return `0 ${symbol}`;
  const digits = n >= 1000 ? 2 : decimals <= 6 ? 4 : n >= 1 ? 6 : 8;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

/** Parse a typed amount, tolerating the thousands separators the inputs add. */
function parseAmount(text: string, decimals: number): bigint {
  const clean = (text || "").replace(/,/g, "").trim();
  if (!clean) return 0n;
  try {
    const v = parseUnits(clean, decimals);
    return v > 0n ? v : 0n;
  } catch {
    return 0n;
  }
}

/** The pool's coin badge, matching the original `pair-ic` markup. */
function PairIcon({ pool }: { pool: BalcorePool }) {
  const cls = pool.key === "btc" ? "c-btc" : "c-avax";
  const glyph = pool.key === "btc" ? "₿" : "A";
  return (
    <>
      <span className={`coin ${cls}`}>{glyph}</span>
      <span className="coin c-usd">$</span>
    </>
  );
}

/** "Bitcoin" / "Avalanche" — the asset half of the pool label. */
const assetName = (pool: BalcorePool) => pool.label.split(" / ")[0] ?? pool.label;

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

type FundingSource = "wallet" | "bank" | "exchange";

const SRC_SUB: Record<FundingSource, string> = {
  wallet: "Your deposit starts making markets at the next placement.",
  bank: "Pay in dollars through Coinbase. It lands as USDC in your wallet in 1–3 business days; then you choose how much goes into a pool.",
  exchange:
    "Not available yet — send it to your own wallet first, then deposit from there.",
};

/**
 * `inspectAs` renders the panel AS another holder, read-only.
 *
 * Unused in production — `Overlays.tsx` passes nothing. It exists so the panel
 * can be verified against a REAL position on mainnet (`/dev/balcore`) without
 * that wallet's key, which is the only way to see the pending-withdrawal and
 * run-mode states before they happen to the person testing.
 */
export default function DepositPanel({ inspectAs }: InspectOptions = {}) {
  const { isConnected: walletConnected } = useAccount();
  const isConnected = Boolean(inspectAs) || walletConnected;

  /* ---- which pool ---- */
  const pools = BALCORE_POOLS;
  const [poolKey, setPoolKey] = useState<PoolKey>("btc");
  const pool = pools.find((p) => p.key === poolKey) ?? pools[0];
  const [poolMenuOpen, setPoolMenuOpen] = useState(false);

  /* ---- chooser / funding source ---- */
  const [choosing, setChoosing] = useState(false);
  const [src, setSrc] = useState<FundingSource>("wallet");

  /* ---- amounts ---- */
  const [mode, setMode] = useState<"usdcOnly" | "both">("usdcOnly");
  const [usdcText, setUsdcText] = useState("");
  const [tokenAText, setTokenAText] = useState("");
  /** Which box the user last typed in, so the other one is the derived one. */
  const [lastEdited, setLastEdited] = useState<"tokenA" | "usdc">("usdc");

  const decA = pool?.tokenA.decimals ?? 8;
  const usdcAmount = parseAmount(usdcText, 6);
  const typedTokenA = parseAmount(tokenAText, decA);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [precisionOpen, setPrecisionOpen] = useState(false);

  /**
   * The APY CAP for the selected pool — the only yield number v1 can state.
   *
   * This slot used to read a hardcoded "30.0%" labelled "/ YR · CAPPED", which
   * was a realised-APY claim the chain cannot support and which contradicted
   * the Overview screen (it shows Net APY as an em dash, capped at this same
   * figure). `apyCapBps` is a real on-chain dial out of `feeDialsPacked`.
   */
  const stats = useVaultStats(poolKey);
  const apyCapText = stats.data ? `${(stats.data.apyCapBps / 100).toFixed(2)}%` : null;

  /* ---- the hook ---- */
  const deposit = useDeposit(
    poolKey,
    { mode, tokenAAmount: mode === "both" ? typedTokenA : 0n, usdcAmount },
    inspectAs ? { inspectAs } : undefined,
  );

  /**
   * Keep the two boxes matched at the live price.
   *
   * The pair has to be within 1% when the transaction lands, so the panel pins
   * the box the user is NOT typing in rather than letting them find out on
   * chain. Matching runs off `deposit.price8`, the LIVE Chainlink answer — not
   * the vault's anchored price, which is a different number and the reason a
   * "matched" pair can still be rejected.
   */
  useEffect(() => {
    if (mode !== "both" || deposit.price8 <= 0n) return;
    if (lastEdited === "usdc") {
      if (usdcAmount <= 0n) {
        if (tokenAText !== "") setTokenAText("");
        return;
      }
      const want = deposit.matchTokenAForUsdc(usdcAmount);
      const shown = formatUnits(want, decA);
      if (shown !== tokenAText) setTokenAText(shown);
    } else {
      if (typedTokenA <= 0n) {
        if (usdcText !== "") setUsdcText("");
        return;
      }
      const want = deposit.matchUsdcForTokenA(typedTokenA);
      const shown = formatUnits(want, 6);
      if (shown !== usdcText) setUsdcText(shown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lastEdited, usdcAmount, typedTokenA, deposit.price8]);

  /* ---- the two cross-boundary globals the script still calls ---- */
  const showChooser = useCallback(() => {
    setChoosing(true);
    setSrc("wallet");
  }, []);
  const goDirect = useCallback((s?: string) => {
    setChoosing(false);
    setSrc(s === "bank" || s === "exchange" ? s : "wallet");
  }, []);

  useEffect(() => {
    const w = window as unknown as {
      __balcoreDepChooser?: () => void;
      __balcoreDepDirect?: (s?: string) => void;
    };
    w.__balcoreDepChooser = showChooser;
    w.__balcoreDepDirect = goDirect;
    return () => {
      delete w.__balcoreDepChooser;
      delete w.__balcoreDepDirect;
    };
  }, [showChooser, goDirect]);

  /**
   * The bank and exchange panels are still the script's. React renders them
   * once and only flips `display`, which is what the original markup did — a
   * conditional render would unmount them and take the script's listeners with
   * it.
   */
  useEffect(() => {
    const set = (id: string, show: boolean) => {
      const el = document.getElementById(id);
      if (el) el.style.display = show ? "" : "none";
    };
    set("depBankPanel", src === "bank");
    set("depExchPanel", src === "exchange");
    set("depWalletPanel", src === "wallet");
  }, [src]);

  /* ---- derived copy ---- */
  const price = Number(formatUnits(deposit.price8, 8));
  const totalUsd = Number(formatUnits(deposit.valuation.totalValue, 6));
  const nextSettle = useMemo(() => new Date(nextTuesday00Z()), []);
  const settleLabel = nextSettle.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const blocker = deposit.checks.blocker;
  const busy = deposit.isBusy;
  const done = deposit.stage === "done";

  /** The one button's label, driven by the stage machine and the pre-checks. */
  const ctaLabel = (() => {
    if (deposit.needsSwitch) return "Switch to Avalanche";
    if (pool?.status !== "live") return "Not open yet";
    if (!isConnected) return "Connect your wallet";
    if (deposit.stage === "swapping") return "Buying the matching half…";
    if (deposit.stage === "approvingTokenA") return `Approving ${pool.tokenA.symbol}…`;
    if (deposit.stage === "approvingUsdc") return "Approving USDC…";
    if (deposit.stage === "preparing") return "Checking…";
    if (deposit.stage === "signing") return "Confirm in wallet…";
    if (deposit.stage === "confirming") return "Depositing…";
    if (usdcAmount <= 0n) return "Enter an amount";
    if (blocker) return blocker.message.length > 46 ? "Cannot deposit yet" : blocker.message;
    if (deposit.needsApproval.swapRouter) return "Approve USDC for the swap";
    if (mode === "usdcOnly" && (deposit.split?.swapUsdc ?? 0n) > 0n && !deposit.legs.tokenA)
      return `Buy ${fmtToken(deposit.split?.targetTokenA ?? 0n, decA, pool.tokenA.symbol)}`;
    if (deposit.needsApproval.tokenA) return `Approve ${pool.tokenA.symbol}`;
    if (deposit.needsApproval.usdc) return "Approve USDC";
    return `Deposit ${fmtUsd(totalUsd)}`;
  })();

  /** The next action the CTA performs, in plan order. */
  const onCta = () => {
    if (deposit.needsSwitch) return deposit.switchNetwork();
    if (deposit.needsApproval.swapRouter) return void deposit.approveSwapRouter();
    if (mode === "usdcOnly" && (deposit.split?.swapUsdc ?? 0n) > 0n && !deposit.legs.tokenA)
      return void deposit.swap();
    if (deposit.needsApproval.tokenA) return void deposit.approveTokenA();
    if (deposit.needsApproval.usdc) return void deposit.approveUsdc();
    return void deposit.deposit();
  };

  const ctaDisabled =
    busy || (!deposit.needsSwitch && (!isConnected || pool?.status !== "live" || Boolean(blocker)));

  if (!pool) {
    return (
      <div className="modal dep-modal">
        <div className="m-head">
          <h2 id="depTitle">Add money</h2>
          <button className="m-close" data-close={true} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="m-sub">
          Balcore is deployed on Avalanche C-Chain only. Switch the app to mainnet to deposit.
        </p>
      </div>
    );
  }

  return (
    <div className={`modal dep-modal${choosing ? " choosing" : ""}`}>
      <div className="m-head">
        <h2 id="depTitle">Add money</h2>
        <button className="m-close" data-close={true} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="m-sub">{choosing ? "Where is your money right now?" : SRC_SUB[src]}</p>

      {/* ---------- first screen: where is the money ---------- */}
      <div className="dep-choose" id="depChoose" hidden={!choosing}>
        <button
          className="dc-card"
          data-src="wallet"
          type="button"
          onClick={() => goDirect("wallet")}
        >
          <span className="dc-ic">
            <svg width="18" height="18" viewBox="0 0 17 17" fill="none">
              <rect
                x="2.5"
                y="4"
                width="12"
                height="9"
                rx="1.8"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path d="M11 8.5h1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path
                d="M11.5 4V3a1.5 1.5 0 0 0-1.9-1.4L4 3"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </span>
          <span className="dc-body">
            <b>In my crypto wallet</b>
            <span>USDC and {assetName(pool)} you already hold in the connected wallet.</span>
            <span className="dc-meta">
              <span className="dc-tag">Ready now</span>
              <span className="dc-tag">Next placement {settleLabel}</span>
            </span>
          </span>
          <span className="dc-chev">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M4.5 3 7.5 6 4.5 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <button className="dc-card" data-src="bank" type="button" onClick={() => goDirect("bank")}>
          <span className="dc-ic">
            <svg width="18" height="18" viewBox="0 0 17 17" fill="none">
              <path
                d="M8.5 2 15 5H2l6.5-3ZM3 5v7M6.3 5v7M10.7 5v7M14 5v7M2 14.5h13"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="dc-body">
            <b>In my bank account</b>
            <span>
              Pay in dollars through Coinbase. Lands as USDC in your wallet; then you choose how
              much goes into a pool.
            </span>
            <span className="dc-meta">
              <span className="dc-tag">1–3 business days</span>
              <span className="dc-tag">Coinbase checkout</span>
            </span>
          </span>
          <span className="dc-chev">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M4.5 3 7.5 6 4.5 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <button
          className="dc-card"
          data-src="exchange"
          type="button"
          onClick={() => goDirect("exchange")}
        >
          <span className="dc-ic">
            <svg width="18" height="18" viewBox="0 0 17 17" fill="none">
              <path
                d="M8.5 2v8.5M5.5 7.5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 10.5v2.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="dc-body">
            <b>On an exchange or another app</b>
            <span>
              Coinbase, Robinhood, Kraken or any wallet. Withdraw the USDC to your own wallet
              first — depositing straight from an exchange isn't live yet.
            </span>
            <span className="dc-meta">
              <span className="dc-tag">Coming soon</span>
            </span>
          </span>
          <span className="dc-chev">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M4.5 3 7.5 6 4.5 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <div className="dep-choose-foot">
          Nothing moves until you confirm, and withdrawals always go to your own wallet.
        </div>
      </div>

      <div id="depBody" hidden={choosing}>
        {/* ---------- funding source tabs ---------- */}
        <div className="src-toggle" role="tablist" aria-label="Funding source">
          <button
            className={src === "wallet" ? "on" : ""}
            data-src="wallet"
            role="tab"
            aria-selected={src === "wallet"}
            onClick={() => setSrc("wallet")}
          >
            <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
              <rect
                x="2.5"
                y="4"
                width="12"
                height="9"
                rx="1.8"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path d="M11 8.5h1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path
                d="M11.5 4V3a1.5 1.5 0 0 0-1.9-1.4L4 3"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
            From wallet
          </button>
          <button
            className={src === "bank" ? "on" : ""}
            data-src="bank"
            role="tab"
            aria-selected={src === "bank"}
            onClick={() => setSrc("bank")}
          >
            <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
              <path
                d="M8.5 2 15 5H2l6.5-3ZM3 5v7M6.3 5v7M10.7 5v7M14 5v7M2 14.5h13"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            From bank
          </button>
          <button
            className={src === "exchange" ? "on" : ""}
            data-src="exchange"
            role="tab"
            aria-selected={src === "exchange"}
            onClick={() => setSrc("exchange")}
          >
            <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
              <path
                d="M8.5 2v8.5M5.5 7.5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 10.5v2.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            From exchange
          </button>
        </div>

        {/* ---------- bank on-ramp: illustrative, still script-driven ---------- */}
        <div id="depBankPanel" style={{ display: "none" }}>
          <div className="dep-body">
          <div className="amt-box">
            <div className="amt-top">
              <span>You add</span>
              <span>Bank transfer · low fee</span>
            </div>
            <div className="amt-row">
              <input
                id="bankAmt"
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Amount to add from bank"
              />
              <span className="unit">USD</span>
            </div>
          </div>
          <div className="quick" id="bankQuick">
            <button data-v="100">$100</button>
            <button data-v="500">$500</button>
            <button data-v="1000">$1K</button>
            <button data-v="5000">$5K</button>
          </div>
          <div className="onramp-flow">
            <div className="onramp-step">
              <span className="onramp-num">1</span>
              <div>
                <b>Pay from your bank</b>
                <span>Secure checkout on Coinbase · 1–3 business days</span>
              </div>
            </div>
            <div className="onramp-arrow">↓</div>
            <div className="onramp-step">
              <span className="onramp-num">2</span>
              <div>
                <b>USDC lands in your wallet</b>
                <span>On Avalanche · not earning until you confirm</span>
              </div>
            </div>
            <div className="onramp-arrow">↓</div>
            <div className="onramp-step">
              <span className="onramp-num">3</span>
              <div>
                <b>Then you choose</b>
                <span>
                  Put any amount into a pool in one tap. We’ll let you know when it lands.
                </span>
              </div>
            </div>
          </div>
          <div className="m-rows">
            <div className="m-row">
              <span className="k">You receive</span>
              <span className="v" id="bankReceive">
                —
              </span>
            </div>
            <div className="m-row">
              <span className="k">Est. fee</span>
              <span className="v mint">Low · shown by Coinbase</span>
            </div>
            <div className="m-row">
              <span className="k">Arrives</span>
              <span className="v">
                ~1–3 business days · <span className="wt-warn">not earning yet</span>
              </span>
            </div>
            <div className="m-row">
              <span className="k">Earliest placement</span>
              <span className="v" id="bankPlacement">
                —
              </span>
            </div>
          </div>
          <div className="notice green">
            <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
              <path
                d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z"
                stroke="#2ee6a8"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Powered by Coinbase. Balcore never sees your bank details — funds go to your own
              wallet first. Your keys, your control.
            </span>
          </div>
          </div>
          <div className="dep-actions">
            <button className="cta" id="bankCta" disabled={true}>
              Enter an amount
            </button>
            <div className="m-foot">
              Fiat on-ramp secured by Coinbase. Final rate &amp; fees shown at checkout.
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------
          Exchange / other-wallet on-ramp — NOT AVAILABLE IN v1.

          This tab used to print a deposit address, a QR code and six network
          chips, and tell people to send USDC to it. The address was a literal
          in this file (it appeared exactly once in the whole repo, was never
          read from a wallet or derived from anything, and was identical for
          every user); the QR was a hand-drawn SVG path that nothing kept in
          sync with it.

          Making it real needs a per-user deposit address — a DepositFactory,
          CREATE2 clones and a CCTP keeper to sweep them. None of that is
          deployed; `grep -ri "DepositFactory\|CREATE2\|computeAddress"` over
          src/ returns nothing. So there is no address to show, and showing one
          anyway is how somebody loses real money.

          Restore the original flow from git history once the factory ships.
        ---------------------------------------------------------------- */}
        <div id="depExchPanel" style={{ display: "none" }}>
          <div className="dep-body">
            <div className="notice">
              <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                <path
                  d="M8.5 2.2 15.3 14H1.7L8.5 2.2Z"
                  stroke="#e0b25c"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path d="M8.5 6.6v3.1" stroke="#e0b25c" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8.5" cy="11.8" r=".8" fill="#e0b25c" />
              </svg>
              <span>
                <b>Not available yet.</b> Depositing straight from an exchange needs a Balcore
                address that belongs to you alone. The contracts that create one are not deployed,
                so there is no address to give you — and we would rather show you nothing than an
                address your money would not come back from.
              </span>
            </div>

            <div className="onramp-flow">
              <div className="onramp-step">
                <span className="onramp-num">1</span>
                <div>
                  <b>Withdraw USDC to your own wallet</b>
                  <span>
                    From Coinbase, Robinhood or wherever it is now, send it to the wallet you
                    signed in with. Avalanche C-Chain if that is offered.
                  </span>
                </div>
              </div>
              <div className="onramp-arrow">↓</div>
              <div className="onramp-step">
                <span className="onramp-num">2</span>
                <div>
                  <b>Deposit it with “From wallet”</b>
                  <span>
                    That tab is live and runs on the real contracts. Your USDC never passes through
                    an address Balcore controls.
                  </span>
                </div>
              </div>
            </div>

            <div className="notice green">
              <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                <path
                  d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z"
                  stroke="#2ee6a8"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                Going through your own wallet keeps the whole path non-custodial: nothing moves
                until you sign for it, and withdrawals always return to the same wallet.
              </span>
            </div>
          </div>
        </div>

        {/* ---------- the real thing: from the connected wallet ---------- */}
        <div id="depWalletPanel">
          {done ? (
            <>
            <div className="dep-body">
            <div className="br-done" id="depDone">
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
              <h3>Deposit confirmed</h3>
              <div className="bd-amt" id="depDoneAmt">
                {fmtUsd(totalUsd)} deposited
              </div>
              <div className="m-rows" style={{ textAlign: "left", margin: "4px 0 14px" }}>
                <div className="m-row">
                  <span className="k">Your shares</span>
                  <span className="v">
                    activate at the next Tuesday settlement ({settleLabel} 00:00 UTC)
                  </span>
                </div>
                <div className="m-row">
                  <span className="k">Your capital</span>
                  <span className="v mint">works from the next hourly decision</span>
                </div>
              </div>
              {deposit.txHash ? (
                <div className="m-foot" style={{ marginBottom: 12 }}>
                  <a
                    href={`${explorerBase}/tx/${deposit.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--violet)" }}
                  >
                    View transaction
                  </a>
                  <span className="mono" style={{ display: "block", opacity: 0.7, fontSize: 11 }}>
                    {deposit.txHash}
                  </span>
                </div>
              ) : null}
            </div>
            </div>
            <div className="dep-actions">
              <button
                className="cta"
                id="depDoneClose"
                onClick={() => {
                  deposit.reset();
                  setUsdcText("");
                  setTokenAText("");
                  document.querySelector<HTMLElement>("#ovDeposit [data-close]")?.click();
                }}
              >
                Done
              </button>
            </div>
            </>
          ) : (
            <>
            <div className="dep-body">
              {/* ---- pool selector ---- */}
              <button
                className="pool-pick pool-pick-btn"
                id="depPoolBtn"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={poolMenuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setPoolMenuOpen((v) => !v);
                }}
              >
                <div className="pair-ic" id="depPoolIc">
                  <PairIcon pool={pool} />
                </div>
                <div style={{ flex: "1", minWidth: "0", textAlign: "left" }}>
                  <div className="name" id="depPoolName">
                    {pool.label}
                  </div>
                  <div className="sub" id="depPoolSub">
                    {pool.tokenA.symbol} · {pool.tokenB.symbol}
                  </div>
                </div>
                <div className="apy">
                  <div className="v" id="depPoolApy">
                    {stats.isLoading ? (
                      <span className="is-loading">…</span>
                    ) : (
                      (apyCapText ?? "—")
                    )}
                  </div>
                  <div className="k">APY CAP</div>
                </div>
                <svg className="pool-caret" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5 6 7.5 9 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div
                className={`pool-menu${poolMenuOpen ? " open" : ""}`}
                id="depPoolMenu"
                role="listbox"
              >
                {pools.map((p) => {
                  const live = p.status === "live";
                  return (
                    <button
                      key={p.key}
                      className={`pool-menu-item${p.key === poolKey ? " on" : ""}`}
                      role="option"
                      aria-selected={p.key === poolKey}
                      data-pool={p.key}
                      type="button"
                      disabled={!live}
                      style={live ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
                      onClick={() => {
                        if (!live) return;
                        setPoolKey(p.key);
                        setPoolMenuOpen(false);
                        setUsdcText("");
                        setTokenAText("");
                      }}
                    >
                      <span className="pair-ic">
                        <PairIcon pool={p} />
                      </span>
                      <span className="pmi-body">
                        <span className="pmi-name">{p.label}</span>
                        <span className="pmi-sub">
                          {/* No APY per row: the cap is read for the SELECTED pool
                              only, and AVAX must never be queried. */}
                          {live ? "Open for deposits" : "Coming soon · not open for deposits"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ---- mode ---- */}
              <div className="dep-mode" id="depMode" role="tablist" aria-label="Deposit type">
                <button
                  className={mode === "usdcOnly" ? "on" : ""}
                  data-mode="auto"
                  role="tab"
                  aria-selected={mode === "usdcOnly"}
                  type="button"
                  onClick={() => setMode("usdcOnly")}
                >
                  USDC only · we split it
                </button>
                <button
                  className={mode === "both" ? "on" : ""}
                  data-mode="both"
                  role="tab"
                  aria-selected={mode === "both"}
                  type="button"
                  onClick={() => {
                    setMode("both");
                    setLastEdited("usdc");
                  }}
                >
                  Both tokens
                </button>
              </div>

              {/* ---- USDC only ---- */}
              {mode === "usdcOnly" ? (
                <div id="depAutoMode">
                  <div className="amt-box">
                    <div className="amt-top">
                      <span>Amount</span>
                      <span id="depWalletLbl">
                        Wallet:{" "}
                        <span
                          className="mono"
                          style={{ color: "var(--text-2)" }}
                          id="depUsdcWalletBal"
                        >
                          {`${Number(formatUnits(deposit.walletBalances.usdc, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`}
                        </span>
                      </span>
                    </div>
                    <div className="amt-row">
                      <input
                        id="depAmt"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label="Deposit amount in dollars"
                        value={usdcText}
                        onChange={(e) => {
                          setLastEdited("usdc");
                          setUsdcText(e.target.value);
                        }}
                      />
                      <span className="unit">USD</span>
                    </div>
                  </div>
                  <div className="quick" id="depQuick">
                    {[100, 500, 1000].map((v) => (
                      <button
                        key={v}
                        data-v={v}
                        onClick={() => {
                          setLastEdited("usdc");
                          setUsdcText(String(v));
                        }}
                      >
                        ${v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    ))}
                    <button
                      data-live="usdc"
                      onClick={() => {
                        setLastEdited("usdc");
                        setUsdcText(formatUnits(deposit.walletBalances.usdc, 6));
                      }}
                    >
                      Max
                    </button>
                  </div>
                  <div className="split">
                    <div>
                      <div className="k" id="depDeployLabel">
                        Deploys as {assetName(pool)}
                      </div>
                      <div className="v" id="depBtc">
                        {deposit.split && deposit.split.targetTokenA > 0n
                          ? fmtToken(deposit.split.targetTokenA, decA, pool.tokenA.symbol)
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="k">Deploys as Dollars</div>
                      <div className="v" id="depUsd">
                        {deposit.split && deposit.split.keepUsdc > 0n
                          ? `${Number(formatUnits(deposit.split.keepUsdc, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  {deposit.split && deposit.split.swapUsdc > 0n ? (
                    <div className="both-note">
                      Half of your USDC buys {assetName(pool)} first — a separate swap you confirm,
                      through {deposit.swapRoute ? deposit.swapRoute.name : "Pharaoh or LFJ"}. The
                      pool takes the two tokens together, matched within 1% at the live price.
                    </div>
                  ) : null}
                </div>
              ) : (
                /* ---- both tokens ---- */
                <div id="depBothMode">
                  <div className="amt-box">
                    <div className="amt-top">
                      <span id="depBothAssetLabel">{assetName(pool)}</span>
                      <span>
                        Wallet:{" "}
                        <span className="mono" style={{ color: "var(--text-2)" }} id="depBothBal">
                          {fmtToken(deposit.walletBalances.tokenA, decA, pool.tokenA.symbol)}
                        </span>{" "}
                        <button
                          className="mini-max"
                          data-max="btc"
                          type="button"
                          onClick={() => {
                            setLastEdited("tokenA");
                            setTokenAText(formatUnits(deposit.walletBalances.tokenA, decA));
                          }}
                        >
                          Max
                        </button>
                      </span>
                    </div>
                    <div className="amt-row">
                      <span
                        className={`coin ${pool.key === "btc" ? "c-btc" : "c-avax"} dep-coin`}
                        id="depBothCoin"
                      >
                        {pool.key === "btc" ? "₿" : "A"}
                      </span>
                      <input
                        id="depBtcIn"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label="Asset amount"
                        value={tokenAText}
                        onChange={(e) => {
                          setLastEdited("tokenA");
                          setTokenAText(e.target.value);
                        }}
                      />
                      <span className="unit" id="depBothUnit">
                        {pool.tokenA.symbol}
                      </span>
                    </div>
                  </div>
                  <div className="both-link">
                    <span className="both-link-line"></span>
                    <span className="both-link-badge">matched at the live price</span>
                    <span className="both-link-line"></span>
                  </div>
                  <div className="amt-box">
                    <div className="amt-top">
                      <span>Dollars</span>
                      <span>
                        Wallet:{" "}
                        <span
                          className="mono"
                          style={{ color: "var(--text-2)" }}
                          id="depBothUsdcBal"
                        >
                          {`${Number(formatUnits(deposit.walletBalances.usdc, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`}
                        </span>{" "}
                        <button
                          className="mini-max"
                          data-max="usdc"
                          type="button"
                          onClick={() => {
                            setLastEdited("usdc");
                            setUsdcText(formatUnits(deposit.walletBalances.usdc, 6));
                          }}
                        >
                          Max
                        </button>
                      </span>
                    </div>
                    <div className="amt-row">
                      <span className="coin c-usd dep-coin">$</span>
                      <input
                        id="depUsdcIn"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label="USDC amount"
                        value={usdcText}
                        onChange={(e) => {
                          setLastEdited("usdc");
                          setUsdcText(e.target.value);
                        }}
                      />
                      <span className="unit">USDC</span>
                    </div>
                  </div>
                  <div className="both-total">
                    <span>Total value</span>
                    <span className="v mono" id="depBothTotal">
                      {fmtUsd(totalUsd)}
                    </span>
                  </div>
                  <div className="both-note">
                    The pool takes both tokens together and checks them against the live Chainlink
                    price, so the box you are not typing in is matched for you. They have to stay
                    within 1% of each other.
                  </div>
                </div>
              )}

              {/* ---- pre-check messages, inline ---- */}
              {deposit.checks.issues.length > 0 ? (
                <div className={`notice${blocker ? "" : " green"}`} style={{ marginTop: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                    <circle
                      cx="8.5"
                      cy="8.5"
                      r="6"
                      stroke={blocker ? "#e0b25c" : "#2ee6a8"}
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8.5 5v4.5"
                      stroke={blocker ? "#e0b25c" : "#2ee6a8"}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>
                    {deposit.checks.issues.map((i) => (
                      <span key={i.code} style={{ display: "block" }}>
                        {i.message}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}

              {/* ---- stage progress ---- */}
              {deposit.plan.length > 4 && !blocker && usdcAmount > 0n ? (
                <div className="m-rows" style={{ marginTop: 10 }}>
                  <div className="m-row">
                    <span className="k">Steps</span>
                    <span className="v">
                      {deposit.plan
                        .filter(
                          (s) =>
                            s !== "preparing" &&
                            s !== "signing" &&
                            s !== "confirming" &&
                            s !== "done",
                        )
                        .map((s) =>
                          s === "swapping"
                            ? `buy ${pool.tokenA.symbol}`
                            : s === "approvingTokenA"
                              ? `approve ${pool.tokenA.symbol}`
                              : "approve USDC",
                        )
                        .concat(["deposit"])
                        .join(" → ")}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* ---- precision card ---- */}
              <div className={`precision${precisionOpen ? " open" : ""}`}>
                <button
                  className="precision-head"
                  id="precisionToggle"
                  aria-expanded={precisionOpen}
                  onClick={() => setPrecisionOpen((v) => !v)}
                >
                  <div className="precision-title">
                    <img src={LOGO} width="15" height="15" alt="" style={{ display: "block" }} />
                    Precision by Balcore
                  </div>
                  <span className="precision-auto">
                    <span className="live-dot"></span>Automatic{" "}
                    <svg
                      className="precision-caret"
                      width="11"
                      height="11"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 4.5 6 7.5 9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                <div className="precision-body" id="precisionBody">
                  <div className="precision-curve">
                    <svg
                      viewBox="0 0 260 44"
                      width="100%"
                      height="44"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label="Concentrated liquidity range auto-placed around the live price"
                    >
                      <defs>
                        <linearGradient id="rangeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b7bf5" stopOpacity=".28" />
                          <stop offset="100%" stopColor="#8b7bf5" stopOpacity=".03" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0 42 L70 42 L95 11 L165 11 L190 42 L260 42 Z"
                        fill="url(#rangeFill)"
                      />
                      <path
                        d="M0 42 L70 42 L95 11 L165 11 L190 42 L260 42"
                        fill="none"
                        stroke="#8b7bf5"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <line
                        x1="130"
                        y1="6"
                        x2="130"
                        y2="42"
                        stroke="#2ee6a8"
                        strokeWidth="1.4"
                        strokeDasharray="3 3"
                      />
                      <circle cx="130" cy="6" r="2.6" fill="#2ee6a8" />
                    </svg>
                    <div className="precision-price">
                      {price > 0 ? `live price ${fmtUsd(price)}` : "live price unavailable"}
                    </div>
                  </div>
                  <div className="precision-chips">
                    <span className="precision-chip">
                      <span className="dot" style={{ background: "var(--violet)" }}></span>
                      Precision-placed
                    </span>
                    <span className="precision-chip">
                      <span className="dot" style={{ background: "var(--mint)" }}></span>Rebalanced
                    </span>
                    <span className="precision-chip">
                      <span className="dot" style={{ background: "var(--gold)" }}></span>
                      IL-protected
                    </span>
                  </div>
                </div>
              </div>

              {/* ---- details ---- */}
              <div className={`dep-details${detailsOpen ? " open" : ""}`} id="depDetails">
                <button
                  className="dep-det-toggle"
                  id="depDetToggle"
                  type="button"
                  aria-expanded={detailsOpen}
                  aria-controls="depDetBody"
                  onClick={() => setDetailsOpen((v) => !v)}
                >
                  <span>Yield, settlement &amp; protection</span>
                  <span className="dep-det-link">
                    Details
                    <svg
                      className="dep-det-chev"
                      width="11"
                      height="11"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M3 4.5 6 7.5 9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                <div className="m-rows dep-det-body" id="depDetBody">
                  <div className="m-row">
                    <span className="k">Yield cap</span>
                    <span className="v mint">30% / yr</span>
                  </div>
                  <div className="m-row">
                    <span className="k">Fees settle</span>
                    <span className="v">Weekly · Tuesday 00:00 UTC</span>
                  </div>
                  <div className="m-row">
                    <span className="k">Shares activate</span>
                    <span className="v">At the next settlement ({settleLabel})</span>
                  </div>
                  <div className="m-row">
                    <span className="k">Protection</span>
                    <span className="v gold">IL coverage from the reserve, when it has funds</span>
                  </div>
                </div>
              </div>

              {/*
                COPY CHANGED, v1 truth. This said Balcore "protects your deposit by
                token count — the quantity of each token you put in is the quantity
                it works to preserve". It does not: shares are valued pro-rata
                against the vault's CURRENT token mix, and the exit basket is struck
                from that mix at request time, not from what you put in. IL coverage
                is a best-effort draw on three reserve funds, not a quantity
                guarantee.
              */}
              <div className="notice green">
                <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                  <path
                    d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z"
                    stroke="#2ee6a8"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  You own a <b>pro-rata share of the pool's current mix</b> of {assetName(pool)} and
                  dollars — which the strategy rebalances, so it is not fixed at what you put in.
                  Impermanent loss is covered from the protocol reserve when it has funds.
                  Non-custodial — your keys, your control.
                </span>
              </div>

              {deposit.error ? (
                <div className="notice" style={{ borderColor: "#e0554b" }}>
                  <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                    <circle cx="8.5" cy="8.5" r="6" stroke="#e0554b" strokeWidth="1.5" />
                    <path d="M8.5 5v4" stroke="#e0554b" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8.5" cy="11.6" r=".8" fill="#e0554b" />
                  </svg>
                  <span>{deposit.error}</span>
                </div>
              ) : null}

              </div>
              <div className="dep-actions">
                <button
                  className="cta"
                  id="depCta"
                  aria-live="polite"
                  disabled={ctaDisabled}
                  onClick={onCta}
                >
                  {ctaLabel}
                </button>
                <div className="m-foot">
                  Deposits take both tokens, matched within 1% at the live Chainlink price. Settles
                  Tuesday 00:00 UTC.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
