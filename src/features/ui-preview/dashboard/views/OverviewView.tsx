import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useTokenBalances } from "../data/balances";
import { getTokenPrices } from "../data/prices";
import { useActivity } from "../data/activity";
import { formatUnits } from "viem";
import { shortenAddress } from "../walletUtils";
import {
  BALCORE_POOLS,
  LIVE_POOLS,
  useClaimYield,
  useUserPosition,
  useVaultStats,
} from "@/lib/balcore";
import { explorerBase } from "@/lib/wagmi";

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

/**
 * What every on-chain number on this screen renders as when it is not a number.
 *
 * An em dash, never a zero: "the vault holds nothing" and "we have not read the
 * vault yet" must not look identical, which is the same rule `bigintAt` follows
 * by returning null instead of 0n.
 */
const NONE = "—";

/** Anything shaped like one of the read hooks' results. */
interface Loadable {
  isLoading: boolean;
  isError: boolean;
}

/**
 * One figure with its three states.
 *
 * `value` is already-formatted text, or null when the underlying read landed
 * but the figure is not derivable from it. Loading wins over everything, so a
 * hook in flight can never paint a stale or zero number.
 */
function figure(src: Loadable, value: string | null): ReactNode {
  if (src.isLoading) return <span className="is-loading">…</span>;
  if (src.isError || value === null) return NONE;
  return value;
}

/** Same three states, but for a `data-*` attribute the imperative script reads. */
function figureAttr(src: Loadable, value: string | null): string {
  if (src.isLoading || src.isError || value === null) return NONE;
  return value;
}

const fmtUsd0 = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtUsd2 = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compact for the wide protocol-scale numbers ($24.6M, $1.84M). */
const fmtUsdShort = (n: number) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(2)}M`
    : n >= 1e3
      ? `$${(n / 1e3).toFixed(1)}K`
      : fmtUsd0(n);

/** A yield figure, which is always a credit in v1. */
const fmtEarned = (n: number) => (n > 0 ? `+${fmtUsd2(n)}` : fmtUsd2(n));

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

function useGreeting(displayName?: string) {
  const { address } = useAccount();
  const [greeting, setGreeting] = useState(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  });

  useEffect(() => {
    const update = () => {
      const h = new Date().getHours();
      let text = "Good evening";
      if (h < 12) text = "Good morning";
      else if (h < 18) text = "Good afternoon";
      setGreeting(text);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const identity = displayName?.trim() || shortenAddress(address) || "";
  return { greeting, identity };
}

type OverviewViewProps = {
  displayName?: string;
};

/**
 * Claimable yield, and the button that claims it.
 *
 * Replaces the auto-compound switch, which advertised a choice the contracts do
 * not offer: there is no compound-or-claim setting anywhere in v1. Settled yield
 * sits in the bank until the holder calls `claimYield()` themselves
 * (BalCoreBank.sol:1294), and nothing reinvests it. A toggle promising otherwise
 * was the most misleading control on this screen.
 *
 * Disabled with the SPECIFIC reason rather than merely greyed, because
 * `NothingToClaim` has three causes and the common one — shares earn only from
 * the week AFTER they activate — reads as a bug if the UI just says "nothing".
 */
function ClaimCard() {
  const claim = useClaimYield("btc");
  const amount = Number(formatUnits(claim.claimable.usdc, 6));
  const reason = claim.disabledReason;
  const busy = claim.isBusy;
  const done = claim.stage === "done";

  const label = claim.needsSwitch
    ? "Switch to Avalanche"
    : claim.stage === "preparing"
      ? "Checking…"
      : claim.stage === "signing"
        ? "Confirm in wallet…"
        : claim.stage === "confirming"
          ? "Claiming…"
          : done
            ? "Claimed ✓"
            : "Claim to wallet";

  return (
    <div id="feeClaim">
      <div className="eng-row" style={{ padding: "8px 0" }}>
        <span className="k">Available to claim</span>
        <span className="v mint" id="feeClaimAmt">
          {amount > 0
            ? `+$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
            : "$0.00"}
        </span>
      </div>
      <button
        className={`fee-claim-btn${done ? " claimed" : ""}`}
        id="feeClaimBtn"
        disabled={busy || done || (!claim.needsSwitch && Boolean(reason))}
        onClick={() => (claim.needsSwitch ? claim.switchNetwork() : void claim.claim())}
      >
        {label}
      </button>
      {reason && !done ? <div className="fee-foot" style={{ marginTop: 6 }}>{reason}</div> : null}
      {claim.error ? (
        <div className="fee-foot" style={{ marginTop: 6, color: "#e0554b" }}>{claim.error}</div>
      ) : null}
      {claim.txHash ? (
        <div className="fee-foot" style={{ marginTop: 6 }}>
          <a
            href={`${explorerBase}/tx/${claim.txHash}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--violet)" }}
          >
            View transaction
          </a>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Overview screen, on live contract state.
 *
 * ONE pool is readable in v1: `BTC_POOL`. AVAX is deployed but its keeper is
 * stopped (config/addresses.ts), so it is rendered as a coming-soon row and NO
 * hook is ever called with "avax" — a read there would be a live call against a
 * pool the product does not offer.
 *
 * Every price a user sees comes from `feedPrice8` / `*AtFeed*`, the live
 * Chainlink answer, never `vault.lastValidPrice()`: the anchor was measured
 * 1.330% away from the feed and is only an accounting reference.
 *
 * Figures that v1 cannot derive from chain state — anything needing history
 * (performance over time, realised APY, all-time earned, "ahead of just
 * holding") and anything needing the keeper-indexed tables (activity, top
 * earners) — render `NONE` or a coming-soon note. None of them are estimated.
 */
export default function OverviewView({ displayName }: OverviewViewProps) {
  const { greeting, identity } = useGreeting(displayName);
  const { address } = useAccount();

  // "btc" only, by design — see the note above.
  const stats = useVaultStats("btc");
  const position = useUserPosition("btc", address);

  const { balances, isLoading: balancesLoading } = useTokenBalances();
  const {
    items: activityItems,
    isLoading: activityLoading,
    isError: activityError,
    isConnected: activityConnected,
  } = useActivity();
  const prices = getTokenPrices();
  const walletTotal = (Object.keys(balances) as (keyof typeof balances)[]).reduce(
    (sum, sym) => sum + balances[sym] * (prices[sym]?.usd ?? 0),
    0,
  );

  const s = stats.data;
  const p = position.data;

  /* ---- derived display values ---- */

  // null — not 0 — whenever the read has not landed: `figure()` turns that into
  // the em dash, so a pending hook can never paint a zero balance.
  const positionValueText = p ? fmtUsd2(p.positionValueAtFeedUsd) : null;
  // `lastWeekYieldUsd` is itself null when the previous epoch is unsettled or
  // predates entry — a real "nothing yet", not a zero.
  const lastWeekText =
    p === null || p.lastWeekYieldUsd === null ? null : fmtEarned(p.lastWeekYieldUsd);
  const apyCapText = s ? fmtPct(s.apyCapBps / 100) : null;
  const sharePctText = p ? fmtPct(p.sharePct) : null;
  const tvlText = s ? fmtUsdShort(s.holderTVLAtFeedUsd) : null;
  const pendingHarvestText = s ? fmtUsd0(s.pendingHarvestUsd) : null;
  const reserveText = s ? fmtUsdShort(s.reserveVaultUsd) : null;

  // Range comes from the LB bin bounds, which are exact — not price-derived.
  const rangeDeployed = s !== null && s.range.lowerBin > 0 && s.range.upperBin > 0;
  const rangeText = rangeDeployed
    ? `${fmtUsd0(s.range.lowerPrice)} – ${fmtUsd0(s.range.upperPrice)}`
    : null;
  const spotText = s !== null && s.feedPrice8 > 0n ? fmtUsd0(s.feedPriceUsd) : null;

  /**
   * Row status, in the order the bank itself would refuse work: paused, then
   * running its queue, then whether a position is even deployed, then the live
   * bin against the deployed bounds.
   */
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

  const btcPool = BALCORE_POOLS.find((pool) => pool.key === "btc");
  const comingSoonPools = BALCORE_POOLS.filter((pool) => pool.status !== "live");

  return (
    <>
    <div className="grid view" id="viewOverview">

      <div className="col-main">
        <header className="page-header">
          <h1 className="page-greeting">
            <span className="greet-muted">{greeting}, </span>
            <span className="greet-name">{identity}</span>
          </h1>
          <p className="page-subtitle">Here's how your market-making is going.</p>
        </header>



        <div className="wd-tracker" id="wdTracker" hidden={true}>
          <div className="wt-head">
            <div className="wt-title"><span className="live-dot" style={{background: "var(--gold)"}}></span>Withdrawal in progress</div>
            <span className="wt-window">7-day window · change your mind any time</span>
          </div>
          <div className="wt-main"><span className="wt-amt" id="wtAmt">$0</span><span className="wt-pair" id="wtPair"></span></div>
          <div className="wt-steps" id="wtSteps">
            <div className="wt-step"><span className="wt-dot"></span><span>Requested</span></div>
            <div className="wt-step"><span className="wt-dot"></span><span>Unwinding</span></div>
            <div className="wt-step"><span className="wt-dot"></span><span>Settlement</span></div>
            <div className="wt-step"><span className="wt-dot"></span><span>In your wallet</span></div>
          </div>
          <div className="wt-bar"><div className="wt-fill" id="wtFill" style={{width: "8%"}}></div></div>
          <div className="wt-foot"><span id="wtEta">—</span><span id="wtDate">—</span></div>
          <div className="wt-actions">
            <button className="wt-act wt-keep" id="wtKeep" type="button">↩ Put back & keep earning</button>
            <button className="wt-act wt-claim" id="wtClaim" type="button" disabled={true}>Claim to wallet</button>
          </div>
          <div className="wt-actnote" id="wtActNote">You can change your mind any time before it settles — put it back and your liquidity keeps earning.</div>
        </div>


        <div className="wd-tracker incoming" id="inTracker" hidden={true} aria-live="polite">
          <div className="wt-head">
            <div className="wt-title"><span className="live-dot"></span><span id="itTitle">Money on its way</span></div>
            <span className="wt-window" id="itWindow">Bank transfer · via Coinbase</span>
            <button className="wt-cancel" id="itKeep" type="button" hidden={true}>Keep in wallet</button>
          </div>
          <div className="wt-main"><span className="wt-amt" id="itAmt">$0</span><span className="wt-pair" id="itPair"></span></div>
          <div className="wt-steps" id="itSteps">
            <div className="wt-step"><span className="wt-dot"></span><span>Sent</span></div>
            <div className="wt-step"><span className="wt-dot"></span><span>In transit</span></div>
            <div className="wt-step"><span className="wt-dot"></span><span>Landed</span></div>
            <div className="wt-step"><span className="wt-dot"></span><span>Deposited</span></div>
          </div>
          <div className="wt-bar"><div className="wt-fill" id="itFill" style={{width: "8%"}}></div></div>
          <div className="wt-foot"><span id="itEta">—</span><span id="itDate">—</span></div>
          <div className="wt-actions">
            <button className="wt-act wt-keep" id="itChange" type="button" aria-haspopup="listbox" aria-expanded="false">Change pool</button>
            <button className="wt-act wt-claim" id="itDeposit" type="button" disabled={true}>Deposit into Bitcoin / Dollar</button>
          </div>
          <div className="pool-menu" id="itMenu" role="listbox" aria-label="Pool for this deposit">
            <button className="pool-menu-item on" role="option" data-pool="btc" type="button"><span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Bitcoin / Dollar</span><span className="pmi-sub">Capped up to {apyCapText ?? NONE}</span></span></button>
          </div>
          <div className="wt-actnote" id="itActNote">The USDC lands in your own wallet. Nothing moves into the pool until you confirm.</div>
        </div>


        <div className="pf-hero">

          <div className="card pf-value">
            {/*
              The "how it grew →" button is gone for the same reason #edgeCard
              is inert: it opened #ovBalBreak, which is still entirely mock.
              The overlay stays in Overlays.tsx; nothing on this screen opens it
              any more. Put the button back when the breakdown reads real data.
            */}
            <div className="card-label">Your balance</div>
            <div className="balance">{figure(position, positionValueText)}</div>
            <div className="pf-delta" id="pfDelta">
              Performance over time needs a price history Balcore does not index yet — coming soon.
            </div>
            <div className="pf-stats">
              <div className="stat">
                <div className="k">Net APY</div>
                <div className="v gold">{NONE}</div>
                <div className="apy-cap">(Capped up to {figure(stats, apyCapText)})</div>
              </div>
              <div className="stat earned-stat">
                <div className="k">Earned</div>
                <div className="earned-cols">
                  <div className="eg-col"><div className="es">All-time</div><div className="v mint">{NONE}</div></div>
                  <div className="eg-col"><div className="es">Last week</div><div className="v mint">{figure(position, lastWeekText)}</div></div>
                </div>
              </div>
            </div>
          </div>


          <div className="pf-side">

            {/*
              Inert while the figure is unavailable. It used to open #ovBalBreak,
              which is still entirely mock, so a card reading "—" led to a modal
              full of invented numbers. The four things that said "clickable" are
              gone: `is-static` drops cursor:pointer, and the button role, tab
              stop and "Details →" link are removed. The listener itself lived in
              dashboardScripts.ts and was deleted there.

              The .pf-mini hover lift STAYS — .pf-value carries the same lift and
              has never been clickable, so in this design it is card polish, not
              an affordance.
            */}
            <div className="card pf-mini wh-mini accent-mint is-static" id="edgeCard">
              <div className="pf-ap-head">
                <div className="card-label">Ahead of just holding</div>
              </div>
              <div className="wh-mini-main">
                <span className="pf-df-v mint" id="edgeVal">{NONE}</span>
              </div>
              <div className="wh-mini-sub">
                Needs your entry-price history · coming soon
              </div>
            </div>

            <div className="card pf-mini wh-mini accent-gold" id="feesByPoolCard" role="button" tabIndex={0} aria-label="Where last week's fees came from, see activity">
              <div className="pf-ap-head">
                <div className="card-label">Fees by pool</div>
                <span className="wh-mini-link" style={{whiteSpace: "nowrap"}}>Activity →</span>
              </div>
              <div className="edge-bars fees-bars" aria-label="Fees by pool">
                <div className="edge-row">
                  <span className="edge-k"><span className="coin c-btc">₿</span>Bitcoin</span>
                  <span className="edge-bar is-bal"><i style={{width: "100%"}}></i></span>
                  <span className="edge-v">{figure(position, lastWeekText)}</span>
                </div>
              </div>
              <div className="wh-mini-sub">last settled week · paid in dollars</div>
            </div>

            <div id="whMiniCard" hidden={true}>
              <span id="whMiniTotal">
                {balancesLoading
                  ? "Loading balance…"
                  : `$${walletTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
              </span>
              <span className="wh-mini-sub">not deposited yet</span>
            </div>
          </div>
        </div>


        <div className="bal-bar" id="balCard" hidden={true}>
          <div className="bal-bar-main">
            <span className="coin c-usd">$</span>
            <div style={{minWidth: "0"}}>
              <div className="bal-bar-title">Available in Balcore <span className="wt-warn">· not earning</span></div>
              <div className="bal-bar-sub" id="balCardSub">USDC on Avalanche · deposit it, hold it, or send it to your wallet</div>
            </div>
          </div>
          <div className="bal-bar-amt" id="balCardTotal">$0</div>
          <div className="bal-actions">
            <button className="bal-act" id="balSend" type="button">Send to wallet</button>
            <button className="bal-act primary" id="balDeposit" type="button">Deposit into a pool</button>
          </div>
        </div>


        <div className="sec-title">
          <h2>Markets you're making</h2>
        </div>

        {btcPool ? (
          <div
            className={`pos${statusOk ? "" : " flag"}`}
            data-pair={btcPool.label}
            data-coins="btc"
            data-hold={figureAttr(position, sharePctText === null ? null : `${sharePctText} of the pool`)}
            data-value={figureAttr(position, positionValueText)}
            data-yield={NONE}
            data-e7={figureAttr(position, lastWeekText)}
            data-eall={NONE}
            data-status={statusOk ? "ok" : "rb"}
            data-status-t={figureAttr(stats, statusLabel)}
            data-range={figureAttr(stats, rangeText)}
            data-rebal={NONE}
          >
            <div className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></div>
            <div>
              <div className="name">{btcPool.label}</div>
              <div className="sub">
                {figure(position, sharePctText === null ? null : `${sharePctText} of the pool`)}
                {spotText ? ` · ${btcPool.tokenA.symbol} ${spotText}` : ""}
              </div>
            </div>
            <div className="col"><div className="k">Value</div><div className="v">{figure(position, positionValueText)}</div></div>
            <div className="col"><div className="k">Your yield</div><div className="v mint">{NONE}</div></div>
            <div className="col"><div className="k">Earned · last week</div><div className="v mint">{figure(position, lastWeekText)}</div></div>
            <span className={`st ${statusOk ? "ok" : "rb"}`}><span className="d"></span>{figure(stats, statusLabel)}</span>
            <button className="manage" data-details={true}>Details</button>
          </div>
        ) : null}

        {comingSoonPools.map((pool) => (
          <div
            className="pos flag"
            key={pool.key}
            // Searchable by the command palette like any other row. No
            // `[data-details]` button: there is nothing to detail on a pool
            // that is not open, and the detail modal reads figures that would
            // all be blank.
            data-pair={pool.label}
            data-coins={pool.key}
            data-hold="Not open yet"
            // The portfolio modal concatenates these into a sentence, so they
            // must be present — an absent attribute renders "undefined".
            data-value={NONE}
            data-yield={NONE}
            data-eall={NONE}
          >
            <div className="pair-ic"><span className="coin c-avax">A</span><span className="coin c-usd">$</span></div>
            <div>
              <div className="name">{pool.label}</div>
              <div className="sub">Not open yet</div>
            </div>
            <div className="col"><div className="k">Value</div><div className="v">{NONE}</div></div>
            <div className="col"><div className="k">Your yield</div><div className="v mint">{NONE}</div></div>
            <div className="col"><div className="k">Earned · last week</div><div className="v mint">{NONE}</div></div>
            <span className="st rb"><span className="d"></span>Coming soon</span>
          </div>
        ))}

        <div className="pos-empty" id="posEmpty" hidden={true}>No pools match your search.</div>


        <div className="sec-title perf-head">
          <h2>Top earners this week</h2>
        </div>
        {/*
          A leaderboard needs every holder's weekly earnings ranked against each
          other. That is a keeper-indexed table of the bank's user events, and it
          does not exist yet — there is no view on BalCoreBank that enumerates
          holders, so this cannot be read from chain state at any cost. The card
          shell stays so the column keeps its rhythm; the rows do not.
        */}
        <div className="lead-list">
          <div className="act-empty">Leaderboard data isn't indexed yet — coming soon.</div>
        </div>

      </div>


      <div className="col-side">

        <div className="card hoverpop mint-pop" style={{borderColor: "rgba(46,230,168,.28)"}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"}}>
            <div className="card-label">Last week's fees</div>
            <span className="mono" style={{fontSize: "11px", color: "var(--text-3)", textAlign: "right", lineHeight: "1.4", flexShrink: "0"}} id="settleIn">Next fees in<br /><span className="sf-time">—</span></span>
          </div>
          <div style={{fontFamily: "var(--mono)", fontSize: "28px", color: "var(--mint)", margin: "4px 0 6px"}}>
            {figure(position, lastWeekText)}
          </div>



          <div className="eng-row" style={{padding: "8px 0"}}><span className="k">Fees collected</span><span className="v" style={{color: "var(--mint)"}}>{NONE}</span></div>
          <div className="eng-row" style={{padding: "8px 0"}}><span className="k">IL covered first</span><span className="v" style={{color: "var(--gold)"}}>{NONE}</span></div>

          <ClaimCard />

          <div className="fee-foot" id="feeFoot">Settles Tuesdays 00:00 UTC · claim it to your wallet whenever you like. Nothing reinvests on its own.</div>
        </div>

        <div className="card soft hoverpop">
          <div className="share-head"><span className="card-label">Your share</span><button className="share-viewall" id="shareViewAll" type="button">View all →</button></div>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "12px 0 4px"}}>
            <div>
              <div style={{fontFamily: "var(--mono)", fontSize: "24px"}}>{figure(position, sharePctText)}</div>
              <div style={{fontSize: "12px", color: "var(--text-3)"}}>of {figure(stats, tvlText)} TVL</div>
            </div>
            <div style={{textAlign: "right"}}>
              <div style={{fontFamily: "var(--mono)", fontSize: "16px"}}>{LIVE_POOLS.length}</div>
              <div style={{fontSize: "12px", color: "var(--text-3)"}}>active {LIVE_POOLS.length === 1 ? "pool" : "pools"}</div>
            </div>
          </div>
          <div className="share-bar">
            <div className="share-lbl"><span>Your share of Bitcoin / Dollar</span><span>{figure(position, sharePctText)}</span></div>
            <div className="share-track">
              <div className="share-fill" style={{ width: p ? `${Math.min(p.sharePct, 100)}%` : "0%" }}></div>
            </div>
          </div>
        </div>

        <div className="card soft act-card hoverpop">
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px"}}>
            <div className="card-label">Recent activity</div>
            <a href="#" data-view="activity" style={{fontSize: "12.5px", fontWeight: "500", color: "var(--violet)"}}>View all →</a>
          </div>
          {!activityConnected ? (
            <div className="act-empty">Connect your wallet to see your activity.</div>
          ) : activityLoading ? (
            <div className="act-empty is-loading">Loading activity…</div>
          ) : activityError ? (
            <div className="act-empty">Couldn’t load on-chain activity right now.</div>
          ) : activityItems.length === 0 ? (
            <div className="act-empty">No activity yet.</div>
          ) : (
            activityItems.slice(0, 4).map((i, idx) => (
              <div className="act-row" key={idx}>
                <span className={"act-ic " + i.iconTone}>{i.icon}</span>
                <div className="act-body"><div className="act-t">{i.title}</div><div className="act-s">{i.subtitle} · {i.time}</div></div>
                <div className={"act-v" + (i.valueTone ? " " + i.valueTone : "")}>{i.value}</div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>

    <div className="sys-bar hoverpop" id="viewOverviewSys">
      <div className="sys-bar-head">
        <span className="card-label">System</span>
        <span className="live-pill" style={{padding: "4px 10px"}}><span className="live-dot"></span>Live</span>
      </div>
      <div className="sys-bar-items">
        <div className="sys-item"><span className="k">Market</span><span className="v">{NONE}</span></div>
        <div className="sys-item"><span className="k">Fees awaiting settlement</span><span className="v mint">{figure(stats, pendingHarvestText)}</span></div>
        <div className="sys-item"><span className="k">Reserve backing</span><span className="v gold">{figure(stats, reserveText)}</span></div>
        <div className="sys-item"><span className="k">Range</span><span className="v">{figure(stats, rangeText)}</span></div>
      </div>
      <a href="#" data-view="protocol" className="proto-jump sys-bar-link">View protocol →</a>
    </div>

    <p className="foot" id="viewOverviewFoot">Protection reduces, but does not eliminate, risk · withdrawals are all-or-nothing, 7 days from request, and settle Tuesdays 00:00 UTC.</p>
    </>
  );
}
