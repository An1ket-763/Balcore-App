import type { ReactNode } from "react";
import { LIVE_POOLS, useVaultStats } from "@/lib/balcore";

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

/** Same convention as OverviewView: an em dash, never a zero. */
const NONE = "—";

interface Loadable {
  isLoading: boolean;
  isError: boolean;
}

function figure(src: Loadable, value: string | null): ReactNode {
  if (src.isLoading) return <span className="is-loading">…</span>;
  if (src.isError || value === null) return NONE;
  return value;
}

const fmtUsd0 = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtUsdShort = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : fmtUsd0(n);

/** A fee dial. 500 bps reads as "5%", 3000 as "30%". */
const fmtBps = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

const fmtToken = (n: number, symbol: string) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 6 })} ${symbol}`;

/** "2d 6h ago" from a unix-seconds timestamp. */
function ago(unixSeconds: bigint): string | null {
  if (unixSeconds <= 0n) return null;
  const ms = Date.now() - Number(unixSeconds) * 1000;
  if (ms < 0) return null;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

/**
 * The Protocol screen, on live contract state.
 *
 * Same rules as OverviewView: one pool is readable in v1 (BTC — AVAX's keeper is
 * stopped and is never queried), every figure is a real read or an explicit
 * placeholder, and nothing is estimated. The screen previously carried 25
 * hardcoded figures including two pools that do not exist.
 *
 * What is NOT derivable in v1 and therefore renders as a placeholder: anything
 * cumulative or period-over-period (fees collected, distributed, protocol
 * revenue, IL covered, earned-by-LPs, 7-day change). Those need an indexed
 * history of the bank's events, which does not exist — the same gap that keeps
 * the Activity and Top Earners sections empty.
 *
 * What IS real and new here: the fee split now reads the protocol's own packed
 * fee dials rather than hand-written copy, so the numbers on screen are the
 * configuration the contracts are actually running.
 */
export default function ProtocolView() {
  const stats = useVaultStats("btc");
  const s = stats.data;

  const tvlText = s ? fmtUsdShort(s.holderTVLAtFeedUsd) : null;
  const reserveText = s ? fmtUsdShort(s.reserveVaultUsd) : null;
  const pendingHarvestText = s ? fmtUsd0(s.pendingHarvestUsd) : null;
  const dials = s?.feeDialsBps ?? null;

  const rangeDeployed = s !== null && s.range.lowerBin > 0 && s.range.upperBin > 0;
  const spotText = s !== null && s.feedPrice8 > 0n ? fmtUsd0(s.feedPriceUsd) : null;
  const lastDistText = s ? ago(s.lastDistributionTimestamp) : null;

  const statusLabel = !s
    ? null
    : s.paused
      ? "Paused"
      : s.runMode
        ? "Rebalancing"
        : !rangeDeployed
          ? "No position"
          : s.inRange
            ? "In range"
            : "Out of range";
  const statusOk = Boolean(s && !s.paused && !s.runMode && rangeDeployed && s.inRange);

  /**
   * Where the live bin sits inside the deployed range, as a 0-100 percentage,
   * for the marker on the range track. Null unless everything it needs is read.
   */
  const markPct = (() => {
    if (!s || !rangeDeployed || s.activeBin === null) return null;
    const span = s.range.upperBin - s.range.lowerBin;
    if (span <= 0) return null;
    const p = ((s.activeBin - s.range.lowerBin) / span) * 100;
    return Math.max(0, Math.min(100, p));
  })();

  return (
    <>
    <div className="view" id="viewProtocol" style={{display: "none"}}>
      <div className="proto-summary">
        <div className="flow-card">
          <div className="flow-head">
            <div>
              <div className="card-label">Protocol flow</div>
              <div className="flow-sub">Fees collected and where they went</div>
            </div>
          </div>
          {/*
            Every figure this card held — fees collected, IL covered, distributed
            to users, protocol revenue, surplus added — is a SUM OVER A PERIOD.
            The contracts expose current state, not history, so none of it can be
            read; the 1W/1M/6M/1Y/ALL toggle was switching between five sets of
            invented totals. The card keeps its shell; the numbers wait for the
            indexer that Activity and Top Earners are also waiting on.
          */}
          <div className="act-empty">
            Fee history isn't indexed yet — coming soon. Live protocol state is below.
          </div>
        </div>
      </div>
      <div className="proto-page">
        <div className="proto-col-main">

          <div className="card hoverpop">
            <div className="card-label" style={{marginBottom: "14px"}}>Capital deployment</div>
            <div className="dep-total">
              <div>
                <div className="dep-k">Total value locked</div>
                <div className="dep-v">{figure(stats, tvlText)}</div>
              </div>
              <div style={{textAlign: "right"}}>
                <div className="dep-k">7-day change</div>
                <div className="dep-v" style={{fontSize: "16px"}}>{NONE}</div>
              </div>
            </div>
            {/*
              The old 20/80 "deployed vs in reserve" bar was invented, and the
              split it implied is not something the vault reports. What IS on
              chain is the vault's actual token reserves, so the card shows those.
            */}
            <div className="dep-legend">
              <div className="row">
                <span className="name">
                  <span className="dot" style={{background: "var(--violet)"}}></span>
                  Vault reserves · {s ? s.pool.tokenA.symbol : "token"}
                </span>
                <b>{figure(stats, s ? fmtToken(s.reservesDisplay.tokenA, s.pool.tokenA.symbol) : null)}</b>
              </div>
              <div className="row">
                <span className="name">
                  <span className="dot" style={{background: "var(--mint)"}}></span>
                  Vault reserves · {s ? s.pool.tokenB.symbol : "stable"}
                </span>
                <b>{figure(stats, s ? fmtToken(s.reservesDisplay.tokenB, s.pool.tokenB.symbol) : null)}</b>
              </div>
            </div>
            <div className="dep-foot">
              <span style={{display: "flex", alignItems: "center", gap: "7px"}}>
                <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z" stroke="#e0b25c" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                IL Shield vault
              </span>
              <span className="mono" style={{color: "var(--gold)"}}>
                {figure(stats, reserveText)} · covers IL first
              </span>
            </div>
          </div>

          <div className="card hoverpop">
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px"}}>
              <div className="card-label">The engine</div>
              <span className="live-pill" style={{padding: "4px 10px"}}><span className="live-dot"></span>Live</span>
            </div>
            {/* Regime and volatility are keeper judgements, not contract state. */}
            <div className="eng-row"><span className="k">Market regime</span><span className="v">{NONE}</span></div>
            <div className="eng-row"><span className="k">Volatility</span><span className="v">{NONE}</span></div>
            <div className="eng-row"><span className="k">Position</span><span className={`v ${statusOk ? "mint" : "gold"}`}>{figure(stats, statusLabel)}</span></div>
            <div className="eng-row"><span className="k">Fees awaiting settlement</span><span className="v mint">{figure(stats, pendingHarvestText)}</span></div>
            <div className="eng-row"><span className="k">Surplus reserve</span><span className="v gold">{figure(stats, reserveText)}</span></div>
            <div className="eng-row"><span className="k">Active pools</span><span className="v">{LIVE_POOLS.length}</span></div>
            <div className="cycle-rail">
              <div className="rail-lbl">THE CYCLE</div>
              <div className="rail" id="rail">
                <div className="node on"><span className="pt"></span>Read</div>
                <div className="node"><span className="pt"></span>Place</div>
                <div className="node"><span className="pt"></span>Protect</div>
                <div className="node"><span className="pt"></span>Pay you</div>
              </div>
              <div className="cycle-timing">
                <div><span className="ct-k">Next payout</span><span className="ct-v mint" id="cycleNext">—</span></div>
                {/* `lastDistributionTimestamp` is the last weekly distribution —
                    not a rebalance, which the vault does not timestamp. */}
                <div><span className="ct-k">Last distribution</span><span className="ct-v">{figure(stats, lastDistText)}</span></div>
              </div>
            </div>
          </div>

        </div>

        <div className="proto-col-side">
          <div className="card hoverpop mint-pop" style={{borderColor: "rgba(46,230,168,.28)"}}>
            <div className="card-label" style={{marginBottom: "6px"}}>How fees are shared</div>
            <div style={{fontSize: "12px", color: "var(--text-3)", marginBottom: "14px"}}>
              Live protocol dials, read from the vault's packed fee configuration
            </div>
            <div className="eng-row">
              <span className="k">LPs earn up to</span>
              <span className="v mint">{figure(stats, dials ? fmtBps(dials.apyCap) : null)} APY</span>
            </div>
            <div className="eng-row">
              <span className="k">Base protocol fee</span>
              <span className="v">{figure(stats, dials ? fmtBps(dials.base) : null)}</span>
            </div>
            <div className="eng-row">
              <span className="k">Performance fee</span>
              <span className="v">{figure(stats, dials ? fmtBps(dials.perf) : null)}</span>
            </div>
            <div className="eng-row">
              <span className="k">Routed to debt repayment</span>
              <span className="v">{figure(stats, dials ? fmtBps(dials.debtRepay) : null)}</span>
            </div>
            <div className="eng-row">
              <span className="k">Reserve health target</span>
              <span className="v gold">{figure(stats, dials ? fmtBps(dials.reserveHealth) : null)}</span>
            </div>
            <div className="eng-row">
              <span className="k">IL skim</span>
              <span className="v">
                {figure(stats, dials ? (dials.ilSkim === 0 ? "Off" : fmtBps(dials.ilSkim)) : null)}
              </span>
            </div>
            <div className="fee-split">
              <div className="fee-split-row"><span>IL is covered first, then the base fee is taken. Yield past the cap builds the surplus reserve.</span></div>
            </div>
          </div>

          <div className="card hoverpop">
            <div className="card-label" style={{marginBottom: "18px"}}>Positioning · where liquidity sits</div>
            {/*
              Real bin bounds from the vault, priced through binToPrice, with the
              live LB bin as the marker. This replaced data/positions.ts, which
              was three hand-written bands including two pools that do not exist.
            */}
            {stats.isLoading ? (
              <div className="act-empty is-loading">Loading positions…</div>
            ) : stats.isError || !s ? (
              <div className="act-empty">Couldn't read the vault right now.</div>
            ) : !rangeDeployed ? (
              <div className="act-empty">No position deployed — the vault is not in a range.</div>
            ) : (
              <div className="pos-range">
                <div className="pr-head">
                  <span className="pr-name">{s.pool.label}</span>
                  <span className={`st ${statusOk ? "ok" : "rb"}`}>
                    <span className="d"></span>{statusLabel ?? NONE}
                  </span>
                </div>
                <div className="pr-track">
                  <div className={`pr-band${s.runMode ? " rb" : ""}`} style={{left: "0%", width: "100%"}}></div>
                  {markPct === null ? null : <div className="pr-mark" style={{left: `${markPct}%`}}></div>}
                </div>
                <div className="pr-labels">
                  <span>{fmtUsd0(s.range.lowerPrice)}</span>
                  <span style={{color: "var(--text-2)"}}>
                    {spotText ? `now ~${spotText}` : NONE}
                  </span>
                  <span>{fmtUsd0(s.range.upperPrice)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
