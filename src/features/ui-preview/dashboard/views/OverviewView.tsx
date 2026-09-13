import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useTokenBalances } from "../data/balances";
import { getTokenPrices } from "../data/prices";
import { useActivity } from "../data/activity";
import { formatUnits } from "viem";
import { shortenAddress } from "../walletUtils";
import { useClaimYield } from "@/lib/balcore";
import { explorerBase } from "@/lib/wagmi";

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

export default function OverviewView({ displayName }: OverviewViewProps) {
  const { greeting, identity } = useGreeting(displayName);

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
            <button className="pool-menu-item on" role="option" data-pool="btc" type="button"><span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Bitcoin / Dollar</span><span className="pmi-sub">30.0% APY · capped 30%</span></span></button>
            <button className="pool-menu-item" role="option" data-pool="tsla" type="button"><span className="pair-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Tesla / Dollar</span><span className="pmi-sub">25.5% APY · capped 30%</span></span></button>
            <button className="pool-menu-item" role="option" data-pool="gold" type="button"><span className="pair-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Gold / Dollar</span><span className="pmi-sub">28.4% APY · capped 30%</span></span></button>
          </div>
          <div className="wt-actnote" id="itActNote">The USDC lands in your own wallet. Nothing moves into the pool until you confirm.</div>
        </div>

        
        <div className="pf-hero">
          
          <div className="card pf-value">
            <div className="card-label" style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px"}}>Your balance <button className="bal-break-link" id="balBreakLink" type="button">how it grew →</button></div>
            <div className="balance" data-countup="2418930" data-prefix="$">$2,418,930</div>
            <div className="pf-delta" id="pfDelta">▲ +$52,400 this month · <span className="mono">28.5% / yr</span></div>
            <div className="pf-stats">
              <div className="stat"><div className="k">Net APY</div><div className="v gold">28.5%</div><div className="apy-cap">(Capped up to 30%)</div></div>
              <div className="stat earned-stat">
                <div className="k">Earned</div>
                <div className="earned-cols">
                  <div className="eg-col"><div className="es">All-time</div><div className="v mint">+$512,400</div></div>
                  <div className="eg-col"><div className="es">Last week</div><div className="v mint">+$13,120</div></div>
                </div>
              </div>
            </div>
            <div className="pf-tf tf" role="tablist" aria-label="Timeframe">
              <button data-tf="1W" role="tab" aria-selected="false">1W</button>
              <button className="on" data-tf="1M" role="tab" aria-selected="true">1M</button>
              <button data-tf="6M" role="tab" aria-selected="false">6M</button>
              <button data-tf="1Y" role="tab" aria-selected="false">1Y</button>
              <button data-tf="All" role="tab" aria-selected="false">ALL</button>
            </div>
            <div className="pf-chart">
              <svg id="heroChart" viewBox="0 0 620 56" width="100%" height="118" preserveAspectRatio="none" role="img" aria-label="Your balance trending up over time">
                <defs>
                  <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b7bf5" stopOpacity=".45" />
                    <stop offset="45%" stopColor="#8b7bf5" stopOpacity=".18" />
                    <stop offset="100%" stopColor="#8b7bf5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <clipPath id="growClip"><rect id="growRect" x="0" y="0" width="0" height="56" /></clipPath>
                <g clipPath="url(#growClip)">
                  <path id="feeFillPath" d="M0 44 L10 42 L20 40 L30 40 L39 39 L49 38 L59 38 L69 37 L79 35 L89 35 L98 36 L108 34 L118 36 L128 38 L138 38 L148 35 L157 37 L167 35 L177 36 L187 37 L197 35 L207 33 L217 34 L226 32 L236 32 L246 34 L256 33 L266 34 L276 32 L285 30 L295 31 L305 30 L315 30 L325 26 L335 26 L344 27 L354 28 L364 28 L374 27 L384 28 L394 30 L403 31 L413 30 L423 30 L433 29 L443 30 L453 28 L463 34 L472 31 L482 34 L492 36 L502 32 L512 29 L522 30 L531 27 L541 29 L551 29 L561 27 L571 28 L581 28 L590 29 L600 28 L610 28 L620 27 L620 56 L0 56 Z" fill="url(#pfFill)" />
                  <path id="feeStrokePath" d="M0 44 L10 42 L20 40 L30 40 L39 39 L49 38 L59 38 L69 37 L79 35 L89 35 L98 36 L108 34 L118 36 L128 38 L138 38 L148 35 L157 37 L167 35 L177 36 L187 37 L197 35 L207 33 L217 34 L226 32 L236 32 L246 34 L256 33 L266 34 L276 32 L285 30 L295 31 L305 30 L315 30 L325 26 L335 26 L344 27 L354 28 L364 28 L374 27 L384 28 L394 30 L403 31 L413 30 L423 30 L433 29 L443 30 L453 28 L463 34 L472 31 L482 34 L492 36 L502 32 L512 29 L522 30 L531 27 L541 29 L551 29 L561 27 L571 28 L581 28 L590 29 L600 28 L610 28 L620 27" fill="none" stroke="#8b7bf5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
                <circle id="tipDot" cx="620" cy="27" r="3.5" fill="#8b7bf5" opacity="0" />
              </svg>
            </div>
          </div>

          
          <div className="pf-side">
            
            <div className="card pf-mini wh-mini accent-mint" id="edgeCard" role="button" tabIndex={0} aria-label="How your balance grew versus just holding">
              <div className="pf-ap-head">
                <div className="card-label">Ahead of just holding</div>
                <span className="wh-mini-link">Details →</span>
              </div>
              <div className="wh-mini-main">
                <span className="pf-df-v mint" id="edgeVal">+$555,720</span>
              </div>
              <div className="edge-bars" aria-hidden="true">
                <div className="edge-row"><span className="edge-k">Holding</span><span className="edge-bar"><i style={{width: "80%"}}></i></span><span className="edge-v">$2.29M</span></div>
                <div className="edge-row"><span className="edge-k">Balcore</span><span className="edge-bar is-bal"><i style={{width: "100%"}}></i></span><span className="edge-v">$2.85M</span></div>
              </div>
              <div className="wh-mini-sub">same coins since you deposited · fees included</div>
            </div>
            
            <div className="card pf-mini wh-mini accent-gold" id="feesByPoolCard" role="button" tabIndex={0} aria-label="Where last week's fees came from, see activity">
              <div className="pf-ap-head">
                <div className="card-label">Fees by pool</div>
                <span className="wh-mini-link" style={{whiteSpace: "nowrap"}}>Activity →</span>
              </div>
              <div className="edge-bars fees-bars" aria-label="Fees by pool">
                <div className="edge-row"><span className="edge-k"><span className="coin c-btc">₿</span>Bitcoin</span><span className="edge-bar is-bal"><i style={{width: "100%"}}></i></span><span className="edge-v">$7,600</span></div>
                <div className="edge-row"><span className="edge-k"><span className="coin c-tsla">T</span>Tesla</span><span className="edge-bar is-bal"><i style={{width: "42%"}}></i></span><span className="edge-v">$3,220</span></div>
                <div className="edge-row"><span className="edge-k"><span className="coin c-gold">Au</span>Gold</span><span className="edge-bar is-bal"><i style={{width: "30%"}}></i></span><span className="edge-v">$2,300</span></div>
              </div>
              <div className="wh-mini-sub"><span className="mono" style={{color: "var(--mint)"}}>+$13,120</span> last week · paid in dollars</div>
            </div>
            
            <div id="whMiniCard" hidden={true}>
              <span id="whMiniTotal">
                {balancesLoading
                  ? "Loading balance…"
                  : `$${walletTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
              </span>
              <span className="wh-mini-sub">4 assets · not deposited yet</span>
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

        <div className="pos" data-pair="Bitcoin / Dollar" data-coins="btc" data-hold="7.88 BTC · 662,000 USDC" data-value="$1,325,000" data-yield="30.0%" data-e7="+$7,640" data-eall="+$104,900" data-status="ok" data-status-t="In range" data-range="$58,500 – $69,500" data-rebal="4 days ago">
          <div className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></div>
          <div><div className="name">Bitcoin / Dollar</div><div className="sub">7.88 BTC · 662,000 USDC</div></div>
          <div className="col"><div className="k">Value</div><div className="v">$1,325,000</div></div>
          <div className="col"><div className="k">Your yield</div><div className="v mint">30.0%</div></div>
          <div className="col"><div className="k">Earned · 7d</div><div className="v mint">+$7,640</div></div>
          <span className="st ok"><span className="d"></span>In range</span>
          <button className="manage" data-details={true}>Details</button>
        </div>

        <div className="pos" data-pair="Tesla / Dollar" data-coins="tsla" data-hold="1,595 TSLA · 328,600 USDC" data-value="$657,200" data-yield="25.5%" data-e7="+$3,220" data-eall="+$48,200" data-status="ok" data-status-t="In range" data-range="$298 – $352" data-rebal="6 days ago">
          <div className="pair-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></div>
          <div><div className="name">Tesla / Dollar</div><div className="sub">1,595 TSLA · 328,600 USDC</div></div>
          <div className="col"><div className="k">Value</div><div className="v">$657,200</div></div>
          <div className="col"><div className="k">Your yield</div><div className="v mint">25.5%</div></div>
          <div className="col"><div className="k">Earned · 7d</div><div className="v mint">+$3,220</div></div>
          <span className="st ok"><span className="d"></span>In range</span>
          <button className="manage" data-details={true}>Details</button>
        </div>

        <div className="pos flag" data-pair="Gold / Dollar" data-coins="gold" data-hold="82.0 XAUt · 217,300 USDC" data-value="$436,730" data-yield="28.4%" data-e7="+$2,330" data-eall="+$32,900" data-status="rb" data-status-t="Rebalancing" data-range="Re-arming · closes Mon" data-rebal="in progress">
          <div className="pair-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></div>
          <div><div className="name">Gold / Dollar</div><div className="sub">82.0 XAUt · 217,300 USDC</div></div>
          <div className="col"><div className="k">Value</div><div className="v">$436,730</div></div>
          <div className="col"><div className="k">Your yield</div><div className="v mint">28.4%</div></div>
          <div className="col"><div className="k">Earned · 7d</div><div className="v mint">+$2,330</div></div>
          <span className="st rb"><span className="d"></span>Rebalancing</span>
          <button className="manage" data-details={true}>Details</button>
        </div>

        <div className="pos-empty" id="posEmpty" hidden={true}>No pools match your search.</div>

        
        <div className="sec-title perf-head">
          <h2>Top earners this week</h2>
          <span className="perf-note">See what the top liquidity providers are earning</span>
        </div>
        <div className="lead-list">
          <div className="lead-row lead-top">
            <span className="lead-rank medal" role="img" aria-label="1st place">🥇</span>
            <span className="lead-id"><span className="lead-name">Marcus</span><span className="lead-addr">0x…a3f2</span></span>
            <span className="lead-pool"><span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span>Bitcoin / Dollar</span>
            <div className="col"><div className="k">Provided</div><div className="v">$3,400,000</div></div>
            <div className="col"><div className="k">Earned · 7d</div><div className="v mint">+$19,620</div></div>
            <div className="col lead-apy"><div className="k">APY</div><div className="v gold">30.0%</div></div>
          </div>
          <div className="lead-row">
            <span className="lead-rank medal" role="img" aria-label="2nd place">🥈</span>
            <span className="lead-id"><span className="lead-addr solo">0x…7b1e</span></span>
            <span className="lead-pool"><span className="pair-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></span>Tesla / Dollar</span>
            <div className="col"><div className="k">Provided</div><div className="v">$3,320,000</div></div>
            <div className="col"><div className="k">Earned · 7d</div><div className="v mint">+$16,340</div></div>
            <div className="col lead-apy"><div className="k">APY</div><div className="v gold">25.5%</div></div>
          </div>
          <div className="lead-row">
            <span className="lead-rank medal" role="img" aria-label="3rd place">🥉</span>
            <span className="lead-id"><span className="lead-name">avalanche.eth</span><span className="lead-addr">0x…c94d</span></span>
            <span className="lead-pool"><span className="pair-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></span>Gold / Dollar</span>
            <div className="col"><div className="k">Provided</div><div className="v">$2,720,000</div></div>
            <div className="col"><div className="k">Earned · 7d</div><div className="v mint">+$14,880</div></div>
            <div className="col lead-apy"><div className="k">APY</div><div className="v gold">28.4%</div></div>
          </div>
          <div className="lead-you">
            <span className="lead-you-k">You</span>
            <span className="lead-you-v">Rank #4 · +$13,120 this week — $1,760 behind #3</span>
            <button className="lead-cta" type="button">Add liquidity →</button>
          </div>
        </div>

      </div>

      
      <div className="col-side">

        <div className="card hoverpop mint-pop" style={{borderColor: "rgba(46,230,168,.28)"}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"}}>
            <div className="card-label">Last week's fees</div>
            <span className="mono" style={{fontSize: "11px", color: "var(--text-3)", textAlign: "right", lineHeight: "1.4", flexShrink: "0"}} id="settleIn">Next fees in<br /><span className="sf-time">—</span></span>
          </div>
          <div style={{fontFamily: "var(--mono)", fontSize: "28px", color: "var(--mint)", margin: "4px 0 6px"}}>+$13,120</div>

          

          <div className="eng-row" style={{padding: "8px 0"}}><span className="k">Fees collected</span><span className="v" style={{color: "var(--mint)"}}>+$14,300</span></div>
          <div className="eng-row" style={{padding: "8px 0"}}><span className="k">IL covered first</span><span className="v" style={{color: "var(--gold)"}}>−$1,180</span></div>

          <ClaimCard />

          <div className="fee-foot" id="feeFoot">Settles Tuesdays 00:00 UTC · claim it to your wallet whenever you like. Nothing reinvests on its own.</div>
        </div>

        <div className="card soft hoverpop">
          <div className="share-head"><span className="card-label">Your share</span><button className="share-viewall" id="shareViewAll" type="button">View all →</button></div>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "12px 0 4px"}}>
            <div><div style={{fontFamily: "var(--mono)", fontSize: "24px"}}>9.84%</div><div style={{fontSize: "12px", color: "var(--text-3)"}}>of $24.6M TVL</div></div>
            <div style={{textAlign: "right"}}><div style={{fontFamily: "var(--mono)", fontSize: "16px"}}>3</div><div style={{fontSize: "12px", color: "var(--text-3)"}}>active pools</div></div>
          </div>
          <div className="share-bar">
            <div className="share-lbl"><span>Your share of BTC / Dollar</span><span>12.6%</span></div>
            <div className="share-track"><div className="share-fill"></div></div>
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
        <div className="sys-item"><span className="k">Market</span><span className="v regime" id="regimeSys" data-regime="calm"><span className="reg-dot"></span><span className="reg-label">Calm</span></span></div>
        <div className="sys-item"><span className="k">Fees this week</span><span className="v mint">~$78,400 tracking</span></div>
        <div className="sys-item"><span className="k">Reserve backing</span><span className="v gold">$1.84M</span></div>
        <div className="sys-item"><span className="k">Working / reserve</span><span className="v">20% / 80%</span></div>
      </div>
      <a href="#" data-view="protocol" className="proto-jump sys-bar-link">View protocol →</a>
    </div>

    <p className="foot" id="viewOverviewFoot">Illustrative figures · protection reduces, but does not eliminate, risk · withdrawals settle Mondays 23:00 UTC.</p>
    </>
  );
}
