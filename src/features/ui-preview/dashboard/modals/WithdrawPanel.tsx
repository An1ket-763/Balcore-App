/**
 * The withdrawal modal, on the real contracts.
 *
 * THE AMOUNT FIELD IS GONE, and that is the whole shape of this screen.
 * `BalCoreBank.requestWithdraw()` takes no argument: it exits the ENTIRE
 * position, burns every share, and freezes a token basket at that instant
 * (BalCoreBank.sol:681-775). v1 has no partial withdrawal, so an amount box with
 * a 25/50/75/Max row would be a control that cannot do what it appears to do.
 * It is replaced by the frozen-basket preview, which is the number that is
 * actually true.
 *
 * The standard path is therefore THREE STATES, not one action:
 *   request   → burns shares, strikes the basket, starts a 7-day clock
 *   pending   → a countdown; `executeWithdraw` reverts `WithdrawNotReady`
 *   ready     → "Collect" calls `executeWithdraw` and the tokens arrive
 * plus `partial`, which W-6 makes reachable: a tranche can be paid and the rest
 * stays claimable, so the claim survives and is re-collectable at once.
 *
 * CANCEL IS NOT AN UNDO. It re-values the basket at today's price and re-mints
 * it as a NEW QUEUED DEPOSIT (:1401-1463) — entry epoch gone, 7-day clock
 * restarted. The consequence text is rendered next to the button, not hidden in
 * a tooltip, because this is the most surprising thing in the flow.
 *
 * Every class name is the one `dashboard.css` already styles.
 */

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import {
  BALCORE_POOLS,
  useFastTrack,
  useVaultStats,
  useWithdraw,
  type BalcorePool,
  type InspectOptions,
  type PoolKey,
} from "@/lib/balcore";
import { explorerBase } from "@/lib/wagmi";

const fmtUsd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const usd = (atoms: bigint) => fmtUsd(Number(formatUnits(atoms, 6)));

function fmtToken(atoms: bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(atoms, decimals));
  if (!Number.isFinite(n) || n === 0) return `0 ${symbol}`;
  const digits = n >= 1000 ? 2 : decimals <= 6 ? 4 : n >= 1 ? 6 : 8;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

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

const assetName = (pool: BalcorePool) => pool.label.split(" / ")[0] ?? pool.label;

type Speed = "standard" | "fast";

/** `inspectAs` renders the panel AS another holder, read-only. See DepositPanel. */
export default function WithdrawPanel({ inspectAs }: InspectOptions = {}) {
  const { isConnected: walletConnected } = useAccount();
  const isConnected = Boolean(inspectAs) || walletConnected;
  const pools = BALCORE_POOLS;
  const [poolKey, setPoolKey] = useState<PoolKey>("btc");
  const pool = pools.find((p) => p.key === poolKey) ?? pools[0];
  const [poolMenuOpen, setPoolMenuOpen] = useState(false);
  const [speed, setSpeed] = useState<Speed>("standard");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const opts = inspectAs ? { inspectAs } : undefined;
  const withdraw = useWithdraw(poolKey, opts);
  const fast = useFastTrack(poolKey, opts);

  /**
   * The APY CAP for the selected pool — see the same note in DepositPanel. This
   * slot used to print a hardcoded "30.0%" as though it were the pool's realised
   * yield; `apyCapBps` is the real dial from `feeDialsPacked`.
   */
  const stats = useVaultStats(poolKey);
  const apyCapText = stats.data ? `${(stats.data.apyCapBps / 100).toFixed(2)}%` : null;

  /**
   * Fast-Track is unavailable on mainnet today (the BTC pool is in run mode), so
   * a user who lands on it would be staring at a dead option. Fall back to the
   * standard path rather than leaving the selection where it cannot act.
   */
  useEffect(() => {
    if (speed === "fast" && !fast.available) setSpeed("standard");
  }, [speed, fast.available]);

  if (!pool) {
    return (
      <div className="modal wd-modal">
        <div className="m-head">
          <h2 id="wdTitle">Withdraw</h2>
          <button className="m-close" data-close={true} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="m-sub">
          Balcore is deployed on Avalanche C-Chain only. Switch the app to mainnet to withdraw.
        </p>
      </div>
    );
  }

  const decA = pool.tokenA.decimals;
  const status = withdraw.status;
  const hasRequest = status === "pending" || status === "ready" || status === "partial";
  const busy = withdraw.isBusy || fast.isBusy;

  /* ---- the position line in the pool selector ---- */
  const positionLabel = hasRequest
    ? `Withdrawing · ${usd(withdraw.basket.strikeValue)}`
    : withdraw.shares > 0n
      ? `Your position · ${usd(fast.preview.gross)}`
      : "No position in this pool";

  /* ---- the primary CTA ---- */
  const standardCheck = hasRequest ? withdraw.checks.execute : withdraw.checks.request;
  const ctaLabel = (() => {
    if (withdraw.needsSwitch) return "Switch to Avalanche";
    if (!isConnected) return "Connect your wallet";
    if (withdraw.stage === "preparing") return "Checking…";
    if (withdraw.stage === "signing") return "Confirm in wallet…";
    if (withdraw.stage === "confirming") return "Submitting…";
    if (fast.stage === "preparing" || fast.stage === "signing" || fast.stage === "confirming")
      return "Confirm in wallet…";
    if (speed === "fast") {
      if (!fast.available) return "Instant exit unavailable";
      return `Withdraw now · receive ${usd(fast.preview.net)}`;
    }
    if (status === "pending") return `Ready in ${withdraw.countdown}`;
    if (status === "ready" || status === "partial")
      return `Collect ${usd(withdraw.preview.payableNow)}`;
    if (withdraw.shares <= 0n) return "Nothing to withdraw";
    return "Request withdrawal · full position";
  })();

  const ctaDisabled =
    busy || (!withdraw.needsSwitch && (speed === "fast" ? !fast.checks.ok : !standardCheck.ok));

  const onCta = () => {
    if (withdraw.needsSwitch) return withdraw.switchNetwork();
    if (speed === "fast") return void fast.instant();
    if (status === "ready" || status === "partial") return void withdraw.execute();
    return void withdraw.request();
  };

  const activeError = withdraw.error ?? fast.error;

  return (
    <div className="modal wd-modal">
      <div className="m-head">
        <h2 id="wdTitle">Withdraw</h2>
        <button className="m-close" data-close={true} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="m-sub">
        {hasRequest
          ? "Your withdrawal is in progress — the basket below is frozen in tokens."
          : "Withdrawing exits your whole position and starts a 7-day wait."}
      </p>

      {/* ---- pool selector ---- */}
      <button
        className="pool-pick pool-pick-btn"
        id="wdPoolBtn"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={poolMenuOpen}
        onClick={(e) => {
          e.stopPropagation();
          setPoolMenuOpen((v) => !v);
        }}
      >
        <div className="pair-ic" id="wdPoolIc">
          <PairIcon pool={pool} />
        </div>
        <div style={{ flex: "1", minWidth: "0", textAlign: "left" }}>
          <div className="name" id="wdPoolName">
            {pool.label}
          </div>
          <div className="sub" id="wdPoolSub">
            {positionLabel}
          </div>
        </div>
        <div className="apy">
          <div className="v" id="wdPoolApy">
            {stats.isLoading ? <span className="is-loading">…</span> : (apyCapText ?? "—")}
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
      <div className={`pool-menu${poolMenuOpen ? " open" : ""}`} id="wdPoolMenu" role="listbox">
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
              }}
            >
              <span className="pair-ic">
                <PairIcon pool={p} />
              </span>
              <span className="pmi-body">
                <span className="pmi-name">{p.label}</span>
                {/* No APY per row — the cap is read for the selected pool only. */}
                <span className="pmi-sub">{live ? "Open for withdrawals" : "Coming soon"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        WHERE THE AMOUNT BOX USED TO BE. One line stating what withdrawing does,
        because the control that used to imply otherwise has been removed.
      */}
      <div className="amt-box">
        <div className="amt-top">
          <span>Withdraw full position</span>
          <span>
            {hasRequest ? "frozen at request" : "all of it · v1 has no partial withdrawal"}
          </span>
        </div>
        <div className="amt-row" style={{ alignItems: "baseline" }}>
          <span className="v mono" style={{ fontSize: 22, flex: 1 }}>
            {hasRequest ? usd(withdraw.basket.strikeValue) : usd(fast.preview.gross)}
          </span>
          <span className="unit">USD</span>
        </div>
      </div>

      {/* ---- the basket, in tokens ---- */}
      <div className="split">
        <div>
          <div className="k">You receive · {assetName(pool)}</div>
          <div className="v" id="wdBtc">
            {hasRequest
              ? fmtToken(withdraw.basket.tokenA, decA, pool.tokenA.symbol)
              : withdraw.shares > 0n
                ? "struck at request"
                : "—"}
          </div>
        </div>
        <div>
          <div className="k">You receive · Dollars</div>
          <div className="v" id="wdUsd">
            {hasRequest
              ? `${Number(formatUnits(withdraw.basket.usdc, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`
              : withdraw.shares > 0n
                ? "struck at request"
                : "—"}
          </div>
        </div>
      </div>

      {/* ---- pending / ready state ---- */}
      {hasRequest ? (
        <div className="m-rows" style={{ marginTop: 10 }}>
          <div className="m-row">
            <span className="k">Status</span>
            <span className="v">
              {status === "pending" ? (
                <>
                  Waiting · <b>{withdraw.countdown}</b> left
                </>
              ) : status === "partial" ? (
                <span className="gold">Part-paid · the rest is still claimable</span>
              ) : (
                <span className="mint">Ready to collect</span>
              )}
            </span>
          </div>
          <div className="m-row">
            <span className="k">Collectable from</span>
            <span className="v">
              {withdraw.readyAt > 0n
                ? new Date(Number(withdraw.readyAt) * 1000).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })
                : "—"}
            </span>
          </div>
          <div className="m-row">
            <span className="k">Payable right now</span>
            <span className="v">
              {usd(withdraw.preview.payableNow)}
              {withdraw.preview.residual > 0n ? (
                <span className="wt-warn"> · {usd(withdraw.preview.residual)} later</span>
              ) : null}
            </span>
          </div>
          {withdraw.runMode ? (
            <div className="m-row">
              <span className="k">Queue</span>
              <span className="v gold">
                This pool is paying withdrawals in order. Yours is held in place.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---- details ---- */}
      <div className={`wd-details${detailsOpen ? " open" : ""}`} id="wdDetails">
        <button
          className="wd-det-toggle"
          id="wdDetToggle"
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="wdDetBody"
          onClick={() => setDetailsOpen((v) => !v)}
        >
          <span>Settlement, fees &amp; protection</span>
          <span className="wd-det-link">
            Details
            <svg className="wd-det-chev" width="11" height="11" viewBox="0 0 12 12" fill="none">
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
        <div className="m-rows wd-det-body" id="wdDetBody">
          <div className="m-row">
            <span className="k">Settles</span>
            <span className="v" id="wdSettle">
              Tuesday 00:00 UTC
            </span>
          </div>
          <div className="m-row">
            <span className="k">Wait</span>
            <span className="v">7 days from your request</span>
          </div>
          <div className="m-row">
            <span className="k">Until you request</span>
            <span className="v mint">Keeps earning · from the request on, it does not</span>
          </div>
          <div className="m-row">
            <span className="k">Frozen in</span>
            <span className="v gold">
              Tokens, at request time — you still carry market movement
            </span>
          </div>
          <div className="m-row">
            <span className="k">Protected by</span>
            <span className="v gold">IL coverage on the standard path only</span>
          </div>
        </div>
      </div>

      {/* ---- speed ---- */}
      <div className="card-label" style={{ marginBottom: "9px" }}>
        Withdrawal speed
      </div>
      <div className="speed-opts" id="wdSpeed">
        <div
          className={`speed-opt${speed === "standard" ? " on" : ""}`}
          data-speed="standard"
          onClick={() => setSpeed("standard")}
        >
          <span className="speed-radio"></span>
          <div className="speed-body">
            <div className="speed-name">
              Standard <span className="speed-tag rec">RECOMMENDED</span>
            </div>
            <div className="speed-sub">Request now, collect in 7 days · IL coverage applies</div>
          </div>
          <div className="speed-meta">
            <div className="speed-fee free">No fee</div>
            <div className="speed-note">full payout</div>
          </div>
        </div>
        <div
          className={`speed-opt${speed === "fast" ? " on" : ""}`}
          data-speed="fast"
          onClick={() => fast.available && setSpeed("fast")}
          style={fast.available ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
          aria-disabled={!fast.available}
        >
          <span className="speed-radio"></span>
          <div className="speed-body">
            <div className="speed-name">
              Fast-Track <span className="speed-tag pri">PRIORITY</span>
            </div>
            <div className="speed-sub">
              {fast.available
                ? "Instant · no 7-day wait, and NO impermanent-loss cover"
                : (fast.unavailableReason ?? "Not available right now")}
            </div>
          </div>
          <div className="speed-meta">
            <div className="speed-fee">3% fee</div>
            <div className="speed-note" id="fastFee">
              {fast.preview.gross > 0n ? `≈ ${usd(fast.preview.fee)}` : "≈ $0"}
            </div>
          </div>
        </div>
      </div>

      {/* ---- the notice, per path ---- */}
      <div className="notice">
        <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
          <circle cx="8.5" cy="8.5" r="6" stroke="#e0b25c" strokeWidth="1.5" />
          <path d="M8.5 5v3.5l2.4 2" stroke="#e0b25c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span id="wdNotice">
          {speed === "fast" ? (
            fast.noIlCoverWarning
          ) : hasRequest ? (
            /* COPY CHANGED: this said "no further action needed". It is not true —
               executeWithdraw is user-called, and nothing arrives until you call it. */
            <>
              Nothing arrives automatically. Once the 7 days are up you have to{" "}
              <b>collect it yourself</b> with the button below, and the tokens go to your wallet.
            </>
          ) : (
            <>
              Requesting stops this position earning and freezes what you get in <b>tokens</b>, not
              dollars — so you still carry market movement for the 7 days. Then you collect it
              yourself.
            </>
          )}
        </span>
      </div>

      {/* ---- per-action blockers ---- */}
      {speed === "standard" && standardCheck.blocker && isConnected && !withdraw.needsSwitch ? (
        <div className="notice" style={{ borderColor: "#e0b25c" }}>
          <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
            <circle cx="8.5" cy="8.5" r="6" stroke="#e0b25c" strokeWidth="1.5" />
            <path d="M8.5 5v4.5" stroke="#e0b25c" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{standardCheck.blocker.message}</span>
        </div>
      ) : null}

      {activeError ? (
        <div className="notice" style={{ borderColor: "#e0554b" }}>
          <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
            <circle cx="8.5" cy="8.5" r="6" stroke="#e0554b" strokeWidth="1.5" />
            <path d="M8.5 5v4" stroke="#e0554b" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8.5" cy="11.6" r=".8" fill="#e0554b" />
          </svg>
          <span>{activeError}</span>
        </div>
      ) : null}

      {(withdraw.stage === "done" || fast.stage === "done") && (withdraw.txHash ?? fast.txHash) ? (
        <div className="notice green">
          <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
            <path
              d="M4 9l3 3 6-6.5"
              stroke="#2ee6a8"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            Submitted.{" "}
            <a
              href={`${explorerBase}/tx/${withdraw.txHash ?? fast.txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--violet)" }}
            >
              View transaction
            </a>
          </span>
        </div>
      ) : null}

      <button className="cta" id="wdCta" aria-live="polite" disabled={ctaDisabled} onClick={onCta}>
        {ctaLabel}
      </button>

      {/* ---- cancel, with its consequence spelled out ---- */}
      {hasRequest ? (
        <div style={{ marginTop: 10 }}>
          {confirmCancel ? (
            <>
              <div className="notice" style={{ borderColor: "#e0b25c" }}>
                <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
                  <circle cx="8.5" cy="8.5" r="6" stroke="#e0b25c" strokeWidth="1.5" />
                  <path d="M8.5 5v4.5" stroke="#e0b25c" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{withdraw.cancelConsequence}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="cta"
                  style={{ flex: 1, background: "transparent", border: "1px solid var(--line)" }}
                  onClick={() => setConfirmCancel(false)}
                  disabled={busy}
                >
                  Keep withdrawing
                </button>
                <button
                  className="cta"
                  style={{ flex: 1 }}
                  disabled={busy || !withdraw.checks.cancel.ok}
                  onClick={() => void withdraw.cancel()}
                >
                  {withdraw.checks.cancel.blocker
                    ? "Cannot cancel"
                    : "Yes, put it back as a new deposit"}
                </button>
              </div>
              {withdraw.checks.cancel.blocker ? (
                <div className="m-foot">{withdraw.checks.cancel.blocker.message}</div>
              ) : null}
            </>
          ) : (
            <button
              className="cta"
              style={{ background: "transparent", border: "1px solid var(--line)" }}
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
            >
              Cancel this withdrawal
            </button>
          )}
        </div>
      ) : null}

      <div className="m-foot">Settles Tuesday 00:00 UTC; withdrawals are 7 days from request.</div>
    </div>
  );
}
