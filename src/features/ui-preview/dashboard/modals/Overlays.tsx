import { useMemo, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { LOGO } from "../logo";
import { useTokenBalances } from "../data/balances";
import { useTokenPrices, type TokenSymbol } from "../data/prices";
import { LIVE_POOLS, useUserPosition, useVaultStats } from "@/lib/balcore";
import SwapPanel from "./SwapPanel";
import BridgePanel from "./BridgePanel";
import DepositPanel from "./DepositPanel";
import WithdrawPanel from "./WithdrawPanel";

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

/** Same convention as OverviewView / ProtocolView: an em dash, never a zero. */
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

const fmtUsd2 = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUsdShort = (n: number) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(2)}M`
    : n >= 1e3
      ? `$${(n / 1e3).toFixed(1)}K`
      : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

/**
 * The assets this deployment can read a balance for AND price.
 *
 * Gold (XAUt) and Tesla rows are gone with `MOCK_BALANCES` — they were fixed
 * quantities of tokens that, per balances.ts's own comment, "aren't real tokens
 * on Avalanche". BTC is now a genuine BTC.b read.
 */
const WALLET_ROWS: { sym: TokenSymbol; coinClass: string; glyph: string; unit: string; pool: string }[] = [
  { sym: "BTC", coinClass: "c-btc", glyph: "₿", unit: "BTC.b", pool: "btc" },
  { sym: "USDC", coinClass: "c-usd", glyph: "$", unit: "USDC", pool: "usdc" },
  { sym: "AVAX", coinClass: "c-avax", glyph: "A", unit: "AVAX", pool: "usdc" },
];

function fmtUsd(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fmtAmt(n: number) {
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export default function Overlays() {
  const { balances, isLoading: balancesLoading } = useTokenBalances();
  const { prices, isLoading: pricesLoading } = useTokenPrices();

  /**
   * Wallet total over the assets that have a live price. `null` when none do;
   * `walletTotalComplete` is false when at least one held asset had to be
   * skipped, which the UI marks with an asterisk rather than quietly
   * under-reporting.
   */
  const { walletTotal, walletTotalComplete } = useMemo(() => {
    let sum = 0;
    let priced = 0;
    let skipped = 0;
    for (const sym of Object.keys(balances) as TokenSymbol[]) {
      const usd = prices[sym]?.usd;
      if (typeof usd === "number") {
        sum += balances[sym] * usd;
        priced++;
      } else if (balances[sym] > 0) {
        skipped++;
      }
    }
    return { walletTotal: priced > 0 ? sum : null, walletTotalComplete: skipped === 0 };
  }, [balances, prices]);

  // "btc" only — AVAX's keeper is stopped and its pool is never queried.
  const { address } = useAccount();
  const stats = useVaultStats("btc");
  const position = useUserPosition("btc", address);
  const s = stats.data;
  const p = position.data;

  const positionValueText = p ? fmtUsd2(p.positionValueAtFeedUsd) : null;
  const sharePctText = p ? fmtPct(p.sharePct) : null;
  const tvlText = s ? fmtUsdShort(s.holderTVLAtFeedUsd) : null;
  const depositValueText = p ? fmtUsd2(p.depositValueUsd) : null;
  const lastWeekText =
    p === null || p.lastWeekYieldUsd === null
      ? null
      : (p.lastWeekYieldUsd > 0 ? "+" : "") + fmtUsd2(p.lastWeekYieldUsd);
  const poolCount = LIVE_POOLS.length;
  const poolLabel = LIVE_POOLS[0]?.label ?? "Bitcoin / Dollar";

  return (
    <>
<div className="overlay" id="ovShare" role="dialog" aria-modal="true" aria-labelledby="shareTitle">
  <div className="modal">
    <div className="m-head">
      <h2 id="shareTitle">Your share by pool</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">
      How much of the pool's liquidity you provide — across {poolCount}{" "}
      {poolCount === 1 ? "active pool" : "active pools"}.
    </p>
    <div className="split" style={{margin: "6px 0 16px"}}>
      <div><div className="k">Your liquidity</div><div className="v mono">{figure(position, positionValueText)}</div></div>
      <div style={{textAlign: "right"}}><div className="k">Share of pool TVL</div><div className="v mono mint">{figure(position, sharePctText)}</div></div>
    </div>
    {/*
      One row, for the one live pool. This list used to carry Tesla / Dollar and
      Gold / Dollar with invented percentages — neither exists in
      config/addresses.ts. `paintPortfolio()` in dashboardScripts.ts reads the
      `data-coins` attribute off these rows to label the portfolio breakdown, so
      the attribute stays.
    */}
    <div className="share-list">
      <div className="share-row" data-coins="btc">
        <span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span>
        <div className="share-row-body">
          <div className="share-row-top">
            <span className="share-pool">{poolLabel}</span>
            <span className="share-pct mono">{figure(position, sharePctText)}</span>
          </div>
          <div className="share-track">
            <div className="share-fill" style={{width: p ? `${Math.min(p.sharePct, 100)}%` : "0%"}}></div>
          </div>
          <div className="share-row-sub">
            <span>{figure(position, positionValueText === null ? null : `${positionValueText} provided`)}</span>
            <span>{figure(stats, tvlText === null ? null : `pool TVL ${tvlText}`)}</span>
          </div>
        </div>
      </div>
    </div>
    <div className="m-foot">A higher share means more of that pool's fees flow to you.</div>
  </div>
</div>


<div className="ack-overlay" id="depAck" hidden={true}>
  <div className="ack-card">
    <div className="ack-ic wait" id="ackIc">⏱</div>
    <h3 className="ack-title" id="ackTitle"></h3>
    <p className="ack-msg" id="ackMsg"></p>
    <div className="ack-actions">
      <button className="ack-back" id="ackBack" type="button">Back</button>
      <button className="ack-go" id="ackGo" type="button">Confirm deposit</button>
    </div>
  </div>
</div>


{/*
  #ovBalBreak ("How your balance grew") was DELETED, not disabled.

  Nothing opened it: #balBreakLink and #edgeCard were both disconnected once
  the figures behind them turned out to be unobtainable. Its thirteen numbers
  were invented, and one row actively contradicted v1 — it credited "Fees
  reinvested · auto-compound" with a "compounding" tag, when v1 has no
  auto-compound at all and yield sits unclaimed until the holder calls
  claimYield(). Rebuild it from an indexed history when one exists.
*/}

<div className="overlay" id="ovDepBreak" role="dialog" aria-modal="true" aria-labelledby="depBreakTitle">
  <div className="modal gold-modal">
    <div className="m-head">
      <h2 id="depBreakTitle">What you deposited</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">The value your position is protected at.</p>
    <div className="split" style={{margin: "6px 0 16px"}}>
      <div><div className="k">Total deposited</div><div className="v mono">{figure(position, depositValueText)}</div></div>
      <div style={{textAlign: "right"}}><div className="k">Across</div><div className="v mono">{poolCount} {poolCount === 1 ? "pool" : "pools"}</div></div>
    </div>
    {/*
      `depositValue` is the strike the bank protects the position at, in tokenB
      atoms — a real read. The ORIGINAL TOKEN SPLIT is not: the bank zeroes the
      queued amounts once a deposit activates, so "7.88 BTC · 662,000 USDC" was
      not recoverable from chain state even for the one live pool. The rows for
      Tesla and Gold were pools that do not exist.
    */}
    <div className="wl-list">
      <div className="wl-row">
        <span className="pair-ic db-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span>
        <div className="wl-body">
          <div className="wl-top">
            <span className="wl-name">{poolLabel}</span>
            <span className="wl-val mono">{figure(position, depositValueText)}</span>
          </div>
          <div className="wl-sub"><span className="mono">{NONE}</span><span>token split not recorded on chain</span></div>
        </div>
      </div>
    </div>
    <p className="m-foot">Impermanent loss is covered against this value before any fee is taken.</p>
  </div>
</div>

<div className="overlay" id="ovWallet" role="dialog" aria-modal="true" aria-labelledby="walletTitle">
  <div className="modal gold-modal">
    <div className="m-head">
      <h2 id="walletTitle">Assets in your wallet</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">Held in your wallet — not deposited, not earning yet.</p>
    <div className="split" style={{margin: "6px 0 16px"}}>
      {/*
        The total covers only the assets that have BOTH a balance and a live
        feed price. An unpriced asset is skipped rather than counted at zero,
        and `walletTotalComplete` says whether anything was skipped so the
        figure is never presented as a full total when it isn't one.
      */}
      <div><div className="k">In your wallet</div><div className="v mono">{
        balancesLoading || pricesLoading
          ? <span className="is-loading">Loading…</span>
          : walletTotal === null
            ? NONE
            : `${fmtUsd(walletTotal)}${walletTotalComplete ? "" : "*"}`
      }</div></div>
      <div style={{textAlign: "right"}}><div className="k">Working in Balcore</div><div className="v mono mint">{figure(position, positionValueText)}</div></div>
    </div>
    <div className="wl-list">
      {WALLET_ROWS.map((r) => (
        <div className="wl-row" key={r.sym}>
          <span className={"coin " + r.coinClass}>{r.glyph}</span>
          <div className="wl-body">
            <div className="wl-top">
              <span className="wl-name">{prices[r.sym].name}</span>
              <span className="wl-val mono">
                {balancesLoading || pricesLoading ? (
                  <span className="is-loading">Loading…</span>
                ) : prices[r.sym].usd === null ? (
                  NONE
                ) : (
                  fmtUsd(balances[r.sym] * (prices[r.sym].usd ?? 0))
                )}
              </span>
            </div>
            <div className="wl-sub">
              <span className="mono">
                {balancesLoading ? <span className="is-loading">Loading…</span> : `${fmtAmt(balances[r.sym])} ${r.unit}`}
              </span>
              <span>
                {r.sym === "USDC"
                  ? "stablecoin"
                  : prices[r.sym].usd === null
                    ? "price unavailable"
                    : `@ ${fmtUsd(prices[r.sym].usd ?? 0)}`}
              </span>
            </div>
          </div>
          <button className="wl-dep" data-pool={r.pool} type="button">Deposit</button>
        </div>
      ))}
    </div>
    <p className="m-foot">Deposit any asset to start market-making. Non-custodial — your keys, your control.</p>
  </div>
</div>

<div className="overlay" id="ovSwap" role="dialog" aria-modal="true" aria-labelledby="swapTitle">
  <SwapPanel />
</div>


<div className="overlay" id="ovBridge" role="dialog" aria-modal="true" aria-labelledby="bridgeTitle">
  <BridgePanel />
</div>


<div className="overlay" id="ovPos" role="dialog" aria-modal="true" aria-labelledby="posTitle">
  <div className="modal">
    <div className="m-head">
      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
        <div className="pair-ic" id="posIc"></div>
        <div>
          <h2 id="posTitle" style={{fontSize: "18px"}}>Bitcoin / Dollar</h2>
          <div className="mono" id="posHold" style={{fontSize: "11.5px", color: "var(--text-3)"}}>—</div>
        </div>
      </div>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>

    <div className="split" style={{marginTop: "16px"}}>
      <div><div className="k">Position value</div><div className="v" id="posValue">—</div></div>
      <div><div className="k">Status</div><div className="v" id="posStatus">—</div></div>
    </div>

    <div className="card-label" style={{margin: "18px 0 8px"}}>Performance</div>
    <div className="m-rows">
      <div className="m-row"><span className="k">This pool's yield</span><span className="v mint" id="posYield">—</span></div>
      <div className="m-row"><span className="k">Earned · 7d</span><span className="v mint" id="posE7">—</span></div>
      <div className="m-row"><span className="k">Earned · all-time</span><span className="v mint" id="posEall">—</span></div>
    </div>

    <div className="card-label" style={{margin: "18px 0 8px"}}>What the engine's doing</div>
    <div className="m-rows">
      <div className="m-row"><span className="k">Current range</span><span className="v" id="posRange">—</span></div>
      <div className="m-row"><span className="k">Last rebalanced</span><span className="v" id="posRebal">—</span></div>
      <div className="m-row"><span className="k">Fees</span><span className="v">Your choice · compound or claim</span></div>
    </div>

    <div className="notice green" style={{marginTop: "16px"}}>
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none"><path d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z" stroke="#2ee6a8" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      <span>The engine sets the range, rebalances, and settles automatically. You only choose what happens to your fees.</span>
    </div>

    <div style={{display: "flex", gap: "10px", marginTop: "16px"}}>
      <button className="cta" id="posAdd" style={{flex: "1"}}>Add to this pool</button>
      <button className="cta" id="posWd" style={{flex: "1", background: "none", border: "1px solid rgba(139,123,245,.4)", boxShadow: "none", color: "var(--text)"}}>Withdraw</button>
    </div>
    <div className="m-foot">Illustrative figures. Withdrawals settle on the weekly cycle.</div>
  </div>
</div>


<div className="overlay" id="ovPortfolio" role="dialog" aria-modal="true" aria-labelledby="pfTitle">
  <div className="modal">
    <div className="m-head">
      <h2 id="pfTitle">Your portfolio</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">Everything you hold through Balcore, and where it is right now.</p>

    <div className="pt-total">
      <div className="pt-total-v" id="pfTotal">—</div>
      <div className="pt-total-k">pools, Balcore account and wallet together</div>
    </div>

    <div className="pt-buckets">
      <div className="pt-bucket">
        <span className="pt-dot" style={{background: "var(--mint)"}}></span>
        {/* Was "Earning · 28.5% / yr net" — a realised-APY claim v1 cannot make. */}
        <div className="pt-bucket-body"><b>Working in pools</b><span id="pfPoolsSub">Earning fees</span></div>
        <div className="pt-bucket-v" id="pfBucketPools">—</div>
        <button className="pt-bucket-act" data-pf="withdraw" type="button">Withdraw</button>
      </div>
      <div className="pt-bucket" id="pfBucketBalRow" hidden={true}>
        <span className="pt-dot" style={{background: "var(--gold)"}}></span>
        <div className="pt-bucket-body"><b>Available in Balcore</b><span>USDC that arrived · not earning</span></div>
        <div className="pt-bucket-v" id="pfBucketBal">—</div>
        <button className="pt-bucket-act" data-pf="balance" type="button">Deposit</button>
      </div>
      <div className="pt-bucket">
        <span className="pt-dot" style={{background: "var(--violet)"}}></span>
        <div className="pt-bucket-body"><b>In your wallet</b><span>Not deposited yet</span></div>
        <div className="pt-bucket-v" id="pfBucketWallet">—</div>
        <button className="pt-bucket-act" data-pf="wallet" type="button">See assets</button>
      </div>
    </div>

    <div className="pt-sec" id="pfMotionSec" hidden={true}>In motion</div>
    <div className="pt-rows" id="pfMotion" hidden={true}></div>

    <div className="pt-sec" style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>By pool <button className="wh-mini-link" id="pfDeposited" type="button" style={{background: "none", border: "0", padding: "0", cursor: "pointer", font: "inherit", fontSize: "11px", fontWeight: 600, letterSpacing: "0", textTransform: "none"}}>What you deposited →</button></div>
    <div className="pt-rows" id="pfPools"></div>

    <div className="pt-sec">By asset</div>
    <div className="pt-rows" id="pfAssets"></div>

    <div className="pt-sec">Earnings</div>
    {/*
      Only the last settled epoch is readable: `lastWeekYield` comes from
      `epochs(currentEpoch - 1).usdcYieldPerShare * shares`. All-time and
      month-to-date are sums over every past epoch, which needs the indexed
      history that Activity and Top Earners are also waiting on.
    */}
    <div className="m-rows">
      <div className="m-row"><span className="k">All time</span><span className="v">{NONE}</span></div>
      <div className="m-row"><span className="k">This month</span><span className="v">{NONE}</span></div>
      <div className="m-row"><span className="k">Last settled week</span><span className="v mint">{figure(position, lastWeekText)}</span></div>
    </div>
    <div className="m-foot">Live figures and proofs on the <a id="pfExplorer" href="/explorer" style={{color: "var(--violet)"}}>Balcore Explorer</a>.</div>
  </div>
</div>


<div className="overlay" id="ovDeposit" role="dialog" aria-modal="true" aria-labelledby="depTitle">
  <DepositPanel />
</div>


<div className="overlay" id="ovWithdraw" role="dialog" aria-modal="true" aria-labelledby="wdTitle">
  <WithdrawPanel />
</div>
    </>
  );
}
