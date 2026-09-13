import { LOGO } from "../logo";
import { useTokenBalances } from "../data/balances";
import { getTokenPrices, type TokenSymbol } from "../data/prices";
import SwapPanel from "./SwapPanel";
import BridgePanel from "./BridgePanel";
import DepositPanel from "./DepositPanel";
import WithdrawPanel from "./WithdrawPanel";

const WALLET_ROWS: { sym: TokenSymbol; coinClass: string; glyph: string; unit: string; pool: string }[] = [
  { sym: "BTC", coinClass: "c-btc", glyph: "₿", unit: "BTC", pool: "btc" },
  { sym: "GOLD", coinClass: "c-gold", glyph: "Au", unit: "XAUt", pool: "gold" },
  { sym: "USDC", coinClass: "c-usd", glyph: "$", unit: "USDC", pool: "usdc" },
  { sym: "AVAX", coinClass: "c-avax", glyph: "A", unit: "AVAX", pool: "usdc" },
  { sym: "TSLA", coinClass: "c-tsla", glyph: "T", unit: "TSLA", pool: "tsla" },
];

function fmtUsd(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fmtAmt(n: number) {
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export default function Overlays() {
  const { balances, isLoading: balancesLoading } = useTokenBalances();
  const prices = getTokenPrices();
  return (
    <>
<div className="overlay" id="ovShare" role="dialog" aria-modal="true" aria-labelledby="shareTitle">
  <div className="modal">
    <div className="m-head">
      <h2 id="shareTitle">Your share by pool</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">How much of each pool's liquidity you provide — across 3 active pools.</p>
    <div className="split" style={{margin: "6px 0 16px"}}>
      <div><div className="k">Your liquidity</div><div className="v mono">$2,418,930</div></div>
      <div style={{textAlign: "right"}}><div className="k">Share of all TVL</div><div className="v mono mint">9.84%</div></div>
    </div>
    <div className="share-list">
      <div className="share-row" data-coins="btc">
        <span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span>
        <div className="share-row-body">
          <div className="share-row-top"><span className="share-pool">Bitcoin / Dollar</span><span className="share-pct mono">12.6%</span></div>
          <div className="share-track"><div className="share-fill" style={{width: "12.6%"}}></div></div>
          <div className="share-row-sub"><span>$1,325,000 provided</span><span>pool TVL $10.5M</span></div>
        </div>
      </div>
      <div className="share-row" data-coins="tsla">
        <span className="pair-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></span>
        <div className="share-row-body">
          <div className="share-row-top"><span className="share-pool">Tesla / Dollar</span><span className="share-pct mono">8.1%</span></div>
          <div className="share-track"><div className="share-fill" style={{width: "8.1%", background: "#e0554b"}}></div></div>
          <div className="share-row-sub"><span>$657,200 provided</span><span>pool TVL $8.1M</span></div>
        </div>
      </div>
      <div className="share-row" data-coins="gold">
        <span className="pair-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></span>
        <div className="share-row-body">
          <div className="share-row-top"><span className="share-pool">Gold / Dollar</span><span className="share-pct mono">7.4%</span></div>
          <div className="share-track"><div className="share-fill" style={{width: "7.4%", background: "#d9b24a"}}></div></div>
          <div className="share-row-sub"><span>$436,730 provided</span><span>pool TVL $5.9M</span></div>
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


<div className="overlay" id="ovBalBreak" role="dialog" aria-modal="true" aria-labelledby="balBreakTitle">
  <div className="modal bb-modal" style={{maxWidth: "420px"}}>
    <div className="m-head">
      <h2 id="balBreakTitle">How your balance grew</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">Where your $2,418,930 came from — and what it's earned over simply holding.</p>

    
    <div className="bb-compare">
      <div className="bb-cmp-leg">
        <div className="bb-cmp-cap">If you'd just held your deposited assets at today's price</div>
        <div className="bb-cmp-amt mono">$2,289,400</div>
      </div>
      <div className="bb-vs">vs</div>
      <div className="bb-cmp-leg is-bal">
        <div className="bb-cmp-cap">With Balcore, it's worth your $2,418,930 position + $426,190 in fees taken</div>
        <div className="bb-cmp-amt mono">$2,845,120</div>
      </div>
    </div>
    <div className="bb-delta"><span className="mono">+$555,720</span><span className="bb-delta-t">ahead of just holding</span></div>

    <div className="bb-sec">In your balance</div>
    <div className="bb-list">
      <div className="bb-row"><span className="bb-k">Deposited from your wallet</span><span className="bb-v mono">$2,332,720</span></div>
      <div className="bb-row"><span className="bb-k">Fees reinvested · auto-compound <span className="bb-tag">compounding</span></span><span className="bb-v mono mint">+$86,210</span></div>
      <div className="bb-row"><span className="bb-k">Net Impermanent Loss after coverage</span><span className="bb-v mono" style={{color: "var(--text-3)"}}>$0</span></div>
      <div className="bb-total"><span className="bb-k">Your balance</span><span className="bb-v mono">$2,418,930</span></div>
    </div>
    <div className="bb-sec">Earned & already withdrawn</div>
    <div className="bb-list">
      <div className="bb-row"><span className="bb-k">Fees claimed to your wallet</span><span className="bb-v mono">$426,190</span></div>
    </div>
    <p className="m-foot">Lifetime fees earned: <b style={{color: "var(--mint)"}}>$512,400</b> — $86,210 compounding here, $426,190 already in your wallet. That puts you <b style={{color: "var(--mint)"}}>$555,720</b> ahead of simply holding — every figure verifiable on-chain.</p>
  </div>
</div>

<div className="overlay" id="ovDepBreak" role="dialog" aria-modal="true" aria-labelledby="depBreakTitle">
  <div className="modal gold-modal">
    <div className="m-head">
      <h2 id="depBreakTitle">What you deposited</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">The exact token quantities you provided — protected by count, not price.</p>
    <div className="split" style={{margin: "6px 0 16px"}}>
      <div><div className="k">Total deposited</div><div className="v mono">$2,332,720</div></div>
      <div style={{textAlign: "right"}}><div className="k">Across</div><div className="v mono">3 pools</div></div>
    </div>
    <div className="wl-list">
      <div className="wl-row"><span className="pair-ic db-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span><div className="wl-body"><div className="wl-top"><span className="wl-name">Bitcoin / Dollar</span><span className="wl-val mono">$1,278,300</span></div><div className="wl-sub"><span className="mono">7.88 BTC · 662,000 USDC</span><span>provided</span></div></div></div>
      <div className="wl-row"><span className="pair-ic db-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></span><div className="wl-body"><div className="wl-top"><span className="wl-name">Tesla / Dollar</span><span className="wl-val mono">$634,300</span></div><div className="wl-sub"><span className="mono">1,595 TSLA · 328,600 USDC</span><span>provided</span></div></div></div>
      <div className="wl-row"><span className="pair-ic db-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></span><div className="wl-body"><div className="wl-top"><span className="wl-name">Gold / Dollar</span><span className="wl-val mono">$420,120</span></div><div className="wl-sub"><span className="mono">82.0 XAUt · 217,300 USDC</span><span>provided</span></div></div></div>
    </div>
    <p className="m-foot">You get these same quantities back on withdrawal — Balcore protects by token count.</p>
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
      <div><div className="k">In your wallet</div><div className="v mono">{balancesLoading ? <span className="is-loading">Loading…</span> : fmtUsd((Object.keys(balances) as TokenSymbol[]).reduce((s, k) => s + balances[k] * (prices[k]?.usd ?? 0), 0))}</div></div>
      <div style={{textAlign: "right"}}><div className="k">Working in Balcore</div><div className="v mono mint">$2,418,930</div></div>
    </div>
    <div className="wl-list">
      {WALLET_ROWS.map((r) => (
        <div className="wl-row" key={r.sym}>
          <span className={"coin " + r.coinClass}>{r.glyph}</span>
          <div className="wl-body">
            <div className="wl-top">
              <span className="wl-name">{prices[r.sym].name}</span>
              <span className="wl-val mono">
                {balancesLoading ? <span className="is-loading">Loading…</span> : fmtUsd(balances[r.sym] * prices[r.sym].usd)}
              </span>
            </div>
            <div className="wl-sub">
              <span className="mono">
                {balancesLoading ? <span className="is-loading">Loading…</span> : `${fmtAmt(balances[r.sym])} ${r.unit}`}
              </span>
              <span>{r.sym === "USDC" ? "stablecoin" : `@ ${fmtUsd(prices[r.sym].usd)}`}</span>
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
        <div className="pt-bucket-body"><b>Working in pools</b><span id="pfPoolsSub">Earning · 28.5% / yr net</span></div>
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
    <div className="m-rows">
      <div className="m-row"><span className="k">All time</span><span className="v mint">+$512,400</span></div>
      <div className="m-row"><span className="k">This month</span><span className="v mint">+$52,400</span></div>
      <div className="m-row"><span className="k">Last week</span><span className="v mint">+$13,120</span></div>
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
