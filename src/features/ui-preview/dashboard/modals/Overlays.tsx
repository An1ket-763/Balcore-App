import { LOGO } from "../logo";
import { useTokenBalances } from "../data/balances";
import { getTokenPrices, type TokenSymbol } from "../data/prices";

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
      <div><div className="k">In your wallet</div><div className="v mono">{balancesLoading ? <span style={{opacity: 0.5}}>Loading…</span> : fmtUsd((Object.keys(balances) as TokenSymbol[]).reduce((s, k) => s + balances[k] * (prices[k]?.usd ?? 0), 0))}</div></div>
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
                {balancesLoading ? <span style={{opacity: 0.5}}>Loading…</span> : fmtUsd(balances[r.sym] * prices[r.sym].usd)}
              </span>
            </div>
            <div className="wl-sub">
              <span className="mono">
                {balancesLoading ? <span style={{opacity: 0.5}}>Loading…</span> : `${fmtAmt(balances[r.sym])} ${r.unit}`}
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
  <div className="modal">
    <div className="m-head">
      <h2 id="swapTitle">Swap</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>

    <div className="swap-field">
      <div className="swap-field-top"><span>You pay</span><span>Balance: <span className="mono" style={{color: "var(--text-2)"}} id="swapFromBal">14,200 USDC</span></span></div>
      <div className="swap-pct" id="swapPct">
        <button className="swap-pct-btn" data-pct="25" type="button">25%</button>
        <button className="swap-pct-btn" data-pct="50" type="button">50%</button>
        <button className="swap-pct-btn" data-pct="75" type="button">75%</button>
        <button className="swap-pct-btn" data-pct="100" type="button">Max</button>
      </div>
      <div className="swap-field-row">
        <input id="swapFrom" inputMode="decimal" placeholder="0.00" aria-label="Amount to pay" />
        <button className="token-pick" id="swapFromTok"><span className="coin c-usd">$</span>USDC<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
    </div>

    <div className="swap-mid">
      <button className="swap-flip" id="swapFlip" aria-label="Flip tokens">
        <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M5.5 3v9M5.5 12 3 9.5M5.5 12 8 9.5M11.5 14V5M11.5 5 9 7.5M11.5 5 14 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>

    <div className="swap-field">
      <div className="swap-field-top"><span>You receive</span><span>Balance: <span className="mono" style={{color: "var(--text-2)"}} id="swapToBal">0.34 BTC</span></span></div>
      <div className="swap-field-row">
        <input id="swapTo" inputMode="decimal" placeholder="0.00" aria-label="Amount to receive" readOnly={true} />
        <button className="token-pick" id="swapToTok"><span className="coin c-btc">₿</span>BTC<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
    </div>

    <div className="route-block">
      <div className="route-head">
        <span className="k">Route</span>
        <span className="route-best-tag"><span className="live-dot"></span>Best price</span>
      </div>
      <div className="route-list" id="routeList">
        <button className="route-opt on" data-route="pharaoh" data-rate="63220"><span className="route-ic">🔺</span><span className="route-name">Pharaoh</span><span className="route-out">63,220</span></button>
        <button className="route-opt" data-route="kyber" data-rate="63190"><span className="route-ic">🌀</span><span className="route-name">KyberSwap</span><span className="route-out">63,190</span></button>
        <button className="route-opt" data-route="odos" data-rate="63160"><span className="route-ic">◎</span><span className="route-name">Odos</span><span className="route-out">63,160</span></button>
        <button className="route-opt" data-route="lfj" data-rate="63130"><span className="route-ic lfj-ic"><img src="data:image/png;base64,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" alt="LFJ" /></span><span className="route-name">LFJ</span><span className="route-out">63,130</span></button>
      </div>
    </div>

    <div className="slip-block">
      <div className="slip-head"><span className="slip-label">Max slippage</span><span className="slip-val" id="slipVal">0.5%</span></div>
      <div className="slip-opts" id="slipOpts">
        <button className="slip-opt" data-slip="0.1" type="button">0.1%</button>
        <button className="slip-opt on" data-slip="0.5" type="button">0.5%</button>
        <button className="slip-opt" data-slip="1" type="button">1%</button>
        <div className="slip-custom"><input id="slipCustom" inputMode="decimal" placeholder="Custom" aria-label="Custom slippage percent" /><span>%</span></div>
      </div>
    </div>

    <div className="notice green">
      <img src={LOGO} width="15" height="15" alt="" style={{display: "block", flexShrink: "0", marginTop: "1px"}} />
      <span>Balcore checks the top Avalanche DEXs and routes your swap through whichever gives the best price. Non-custodial.</span>
    </div>

    <button className="cta" id="swapCta" disabled={true}>Enter an amount</button>
    <div className="br-done" id="swapDone" hidden={true}>
      <div className="bd-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      <h3>Swap complete</h3>
      <div className="bd-amt" id="swapDoneAmt"></div>
      <button className="cta" id="swapDoneClose">Done</button>
    </div>
    <div className="swap-details" id="swapDetails">
      <div className="swap-det-row">
        <span className="swap-det-rate" id="swapDetSummary">1 BTC ≈ 63,200 USDC ($63,200.00)</span>
        <button className="swap-det-link" id="swapDetToggle" type="button" aria-expanded="false" aria-controls="swapDetBody">Show details</button>
      </div>
      <div className="swap-rows m-rows swap-det-body" id="swapDetBody">
        <div className="m-row"><span className="k">Rate</span><span className="v" id="swapRate">1 BTC = 63,200 USDC</span></div>
        <div className="m-row"><span className="k">Routed via</span><span className="v" id="swapVia">Pharaoh</span></div>
        <div className="m-row"><span className="k">Min received</span><span className="v" id="swapMinOut">—</span></div>
        <div className="m-row"><span className="k">Price impact</span><span className="v" id="swapImpact">{"<0.01%"}</span></div>
        <div className="m-row"><span className="k">Network fee</span><span className="v">≈ $0.02 · Avalanche</span></div>
      </div>
    </div>
    <div className="m-foot">Illustrative rates. Best route selected automatically at swap time.</div>
  </div>
</div>


<div className="overlay" id="ovBridge" role="dialog" aria-modal="true" aria-labelledby="bridgeTitle">
  <div className="modal bridge-modal">
    <div className="m-head">
      <h2 id="bridgeTitle">Bridge USDC to Balcore</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="br-subtitle" id="brSubtitle">Bring USDC in from any chain — then deposit and start market making.</p>

    <div className="br-dir">
      <div className="br-chain glow-from">
        <span className="br-ic" id="brFromIc"></span>
        <div className="br-meta">
          <div className="br-lbl">From</div>
          <div className="br-name" id="brFromName">Ethereum</div>
        </div>
      </div>
      <div className="br-link">
        <div className="br-line"></div>
        <div className="br-pulse"></div>
        <button className="br-swap-dir" id="brFlip" aria-label="Reverse bridge direction" title="Reverse direction">
          <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M4 5.5h9M10.5 3l2.5 2.5-2.5 2.5M13 11.5H4M6.5 9 4 11.5 6.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="br-chain glow-to">
        <span className="br-ic" id="brToIc"></span>
        <div className="br-meta">
          <div className="br-lbl">To</div>
          <div className="br-name" id="brToName">Avalanche C-Chain</div>
        </div>
      </div>
    </div>

    <div className="br-chips" id="brChips" role="group" aria-label="Select the other chain">
      <button className="br-chip on" data-chain="Ethereum"><span className="bc-ic"></span>Ethereum</button>
      <button className="br-chip" data-chain="Base"><span className="bc-ic"></span>Base</button>
      <button className="br-chip" data-chain="Arbitrum"><span className="bc-ic"></span>Arbitrum</button>
      <button className="br-chip" data-chain="Polygon"><span className="bc-ic"></span>Polygon</button>
      <button className="br-chip" data-chain="Solana"><span className="bc-ic"></span>Solana</button>
      <button className="br-chip soon" data-chain="NEAR" aria-disabled="true" title="Native USDC is live on NEAR \u2014 route opens when Circle connects NEAR to CCTP"><span className="bc-ic"></span>NEAR<span className="bc-soon">Soon</span></button>
      <button className="br-chip soon" data-chain="Robinhood Chain" aria-disabled="true" title="Robinhood Chain mainnet is live \u2014 route opens when Circle ships native USDC / CCTP support"><span className="bc-ic"></span>Robinhood<span className="bc-soon">Soon</span></button>
    </div>

    <div className="swap-field">
      <div className="swap-field-top"><span>Amount</span><span>Balance: <span className="mono" style={{color: "var(--text-2)"}} id="brBal">14,200 USDC</span></span></div>
      <div className="swap-pct" id="brPct">
        <button className="swap-pct-btn" data-pct="25" type="button">25%</button>
        <button className="swap-pct-btn" data-pct="50" type="button">50%</button>
        <button className="swap-pct-btn" data-pct="75" type="button">75%</button>
        <button className="swap-pct-btn" data-pct="100" type="button">Max</button>
      </div>
      <div className="swap-field-row">
        <input id="brAmt" inputMode="decimal" placeholder="0.00" aria-label="Amount of USDC to bridge" />
        <button className="token-pick" style={{cursor: "default"}} tabIndex={-1}><span className="coin c-usd">$</span>USDC</button>
      </div>
    </div>

    <div className="br-speed" role="group" aria-label="Transfer speed">
      <button className="br-speed-opt on" data-speed="fast">
        <div className="bs-t"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M9 1.5 3.5 9H7l-1 5.5L11.5 7H8l1-5.5Z" fill="currentColor" /></svg>Fast</div>
        <div className="bs-s">~30 seconds · small fee</div>
      </button>
      <button className="br-speed-opt" data-speed="standard">
        <div className="bs-t"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M8 4.8V8l2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>Standard</div>
        <div className="bs-s">Waits for finality · no protocol fee</div>
      </button>
    </div>

    <div className="swap-rows m-rows">
      <div className="m-row"><span className="k">Route</span><span className="v">Circle CCTP v2 · native burn & mint</span></div>
      <div className="m-row"><span className="k">You receive</span><span className="v mono" id="brRecv">—</span></div>
      <div className="m-row"><span className="k">Bridge fee</span><span className="v" id="brFee">—</span></div>
      <div className="m-row"><span className="k">Est. time</span><span className="v" id="brEta">~30 seconds</span></div>
    </div>

    <div className="br-pipe" aria-hidden="true"><span className="bp">Burn</span><span className="bp-arrow">→</span><span className="bp">Attest</span><span className="bp-arrow">→</span><span className="bp">Mint</span></div>

    <div className="br-review" id="brReviewNote" hidden={true}></div>
    <button className="cta" id="brCta" disabled={true}>Enter an amount</button>
    <div className="br-progress" id="brProgress" hidden={true} aria-live="polite">
      <div id="brSteps"></div>
      <div className="br-done" id="brDone" hidden={true}>
        <div className="bd-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <h3 id="brDoneTitle">Bridge complete</h3>
        <div className="bd-amt" id="brDoneAmt"></div>
        <button className="cta" id="brDonePrimary">Deposit & start market making</button>
        <button className="br-again" id="brAgain">Bridge again</button>
      </div>
    </div>
  </div>
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


<div className="overlay" id="ovDeposit" role="dialog" aria-modal="true" aria-labelledby="depTitle">
  <div className="modal">
    <div className="m-head">
      <h2 id="depTitle">Add money</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">Your deposit starts making markets at the next placement.</p>

    <div className="src-toggle" role="tablist" aria-label="Funding source">
      <button className="on" data-src="wallet" role="tab" aria-selected="true">
        <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><rect x="2.5" y="4" width="12" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.4" /><path d="M11 8.5h1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M11.5 4V3a1.5 1.5 0 0 0-1.9-1.4L4 3" stroke="currentColor" strokeWidth="1.4" /></svg>
        From wallet
      </button>
      <button data-src="bank" role="tab" aria-selected="false">
        <svg width="15" height="15" viewBox="0 0 17 17" fill="none"><path d="M8.5 2 15 5H2l6.5-3ZM3 5v7M6.3 5v7M10.7 5v7M14 5v7M2 14.5h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        From bank
      </button>
    </div>

    
    <div id="depBankPanel" style={{display: "none"}}>
      <div className="amt-box">
        <div className="amt-top"><span>You add</span><span>Bank transfer · low fee</span></div>
        <div className="amt-row">
          <input id="bankAmt" inputMode="decimal" placeholder="0.00" aria-label="Amount to add from bank" />
          <span className="unit">USD</span>
        </div>
      </div>
      <div className="quick" id="bankQuick">
        <button data-v="100">$100</button><button data-v="500">$500</button><button data-v="1000">$1K</button><button data-v="5000">$5K</button>
      </div>

      <div className="onramp-flow">
        <div className="onramp-step"><span className="onramp-num">1</span><div><b>Pay from your bank</b><span>Secure checkout on Coinbase · they handle it</span></div></div>
        <div className="onramp-arrow">↓</div>
        <div className="onramp-step"><span className="onramp-num">2</span><div><b>USDC lands in your wallet</b><span>On Avalanche · you stay in control</span></div></div>
        <div className="onramp-arrow">↓</div>
        <div className="onramp-step"><span className="onramp-num">3</span><div><b>Deposit into Balcore</b><span>Start making markets</span></div></div>
      </div>

      <div className="m-rows">
        <div className="m-row"><span className="k">You receive</span><span className="v" id="bankReceive">—</span></div>
        <div className="m-row"><span className="k">Est. fee</span><span className="v mint">Low · shown by Coinbase</span></div>
        <div className="m-row"><span className="k">Arrives</span><span className="v">~1–3 days · bank transfer</span></div>
      </div>

      <div className="notice green">
        <svg width="14" height="14" viewBox="0 0 17 17" fill="none"><path d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z" stroke="#2ee6a8" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <span>Powered by Coinbase. Balcore never sees your bank details — funds go to your own wallet first. Your keys, your control.</span>
      </div>

      <button className="cta" id="bankCta" disabled={true}>Enter an amount</button>
      <div className="m-foot">Fiat on-ramp secured by Coinbase. Final rate & fees shown at checkout.</div>
    </div>

    
    <div id="depWalletPanel">
    <button className="pool-pick pool-pick-btn" id="depPoolBtn" type="button" aria-haspopup="listbox" aria-expanded="false">
      <div className="pair-ic" id="depPoolIc"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></div>
      <div style={{flex: "1", minWidth: "0", textAlign: "left"}}><div className="name" id="depPoolName">Bitcoin / Dollar</div><div className="sub" id="depPoolSub">BTC · USDC</div></div>
      <div className="apy"><div className="v" id="depPoolApy">30.0%</div><div className="k">/ YR · CAPPED</div></div>
      <svg className="pool-caret" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <div className="pool-menu" id="depPoolMenu" role="listbox">
      <button className="pool-menu-item on" role="option" data-pool="btc" type="button"><span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Bitcoin / Dollar</span><span className="pmi-sub">30.0% APY · capped 30%</span></span></button>
      <button className="pool-menu-item" role="option" data-pool="tsla" type="button"><span className="pair-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Tesla / Dollar</span><span className="pmi-sub">25.5% APY · capped 30%</span></span></button>
      <button className="pool-menu-item" role="option" data-pool="gold" type="button"><span className="pair-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Gold / Dollar</span><span className="pmi-sub">28.4% APY · capped 30%</span></span></button>
    </div>

    <div className="dep-mode" id="depMode" role="tablist" aria-label="Deposit type">
      <button className="on" data-mode="auto" role="tab" aria-selected="true" type="button">Convert USDC</button>
      <button data-mode="both" role="tab" aria-selected="false" type="button">Provide both tokens</button>
    </div>

    
    <div id="depAutoMode">
      <div className="amt-box">
        <div className="amt-top"><span>Amount</span><span>Wallet: <span className="mono" style={balancesLoading ? {color: "var(--text-2)", opacity: 0.5} : {color: "var(--text-2)"}} id="depUsdcWalletBal">{balancesLoading ? "Loading…" : `${fmtAmt(balances.USDC)} USDC`}</span></span></div>
        <div className="amt-row">
          <input id="depAmt" inputMode="decimal" placeholder="0.00" aria-label="Deposit amount in dollars" />
          <span className="unit">USD</span>
        </div>
      </div>
      <div className="quick" id="depQuick">
        <button data-v="1000">$1K</button><button data-v="5000">$5K</button><button data-v="10000">$10K</button><button data-live="usdc">Max</button>
      </div>
      <div className="split">
        <div><div className="k" id="depDeployLabel">Deploys as Bitcoin</div><div className="v" id="depBtc">—</div></div>
        <div><div className="k">Deploys as Dollars</div><div className="v" id="depUsd">—</div></div>
      </div>
    </div>

    
    <div id="depBothMode" hidden={true}>
      <div className="amt-box">
        <div className="amt-top"><span id="depBothAssetLabel">Bitcoin</span><span>Wallet: <span className="mono" style={{color: "var(--text-2)"}} id="depBothBal">0.77 BTC</span> <button className="mini-max" data-max="btc" type="button">Max</button></span></div>
        <div className="amt-row"><span className="coin c-btc dep-coin" id="depBothCoin">₿</span><input id="depBtcIn" inputMode="decimal" placeholder="0.00" aria-label="Asset amount" /><span className="unit" id="depBothUnit">BTC</span></div>
      </div>
      <div className="both-link"><span className="both-link-line"></span><span className="both-link-badge">matched to pool ratio</span><span className="both-link-line"></span></div>
      <div className="amt-box">
        <div className="amt-top"><span>Dollars</span><span>Wallet: <span className="mono" style={balancesLoading ? {color: "var(--text-2)", opacity: 0.5} : {color: "var(--text-2)"}} id="depBothUsdcBal">{balancesLoading ? "Loading…" : `${fmtAmt(balances.USDC)} USDC`}</span> <button className="mini-max" data-max="usdc" type="button">Max</button></span></div>
        <div className="amt-row"><span className="coin c-usd dep-coin">$</span><input id="depUsdcIn" inputMode="decimal" placeholder="0.00" aria-label="USDC amount" /><span className="unit">USDC</span></div>
      </div>
      <div className="both-total"><span>Total value</span><span className="v mono" id="depBothTotal">$0.00</span></div>
      <div className="both-note">Balcore keeps your two tokens matched at the live price so your liquidity deploys straight into the range — no swap needed.</div>
    </div>

    <div className="precision">
      <button className="precision-head" id="precisionToggle" aria-expanded="false">
        <div className="precision-title">
          <img src={LOGO} width="15" height="15" alt="" style={{display: "block"}} />
          Precision by Balcore
        </div>
        <span className="precision-auto"><span className="live-dot"></span>Automatic <svg className="precision-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      <div className="precision-body" id="precisionBody">
      <div className="precision-curve">
        <svg viewBox="0 0 260 44" width="100%" height="44" preserveAspectRatio="none" role="img" aria-label="Concentrated liquidity range auto-placed around the live price">
          <defs><linearGradient id="rangeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7bf5" stopOpacity=".28" /><stop offset="100%" stopColor="#8b7bf5" stopOpacity=".03" /></linearGradient></defs>
          <path d="M0 42 L70 42 L95 11 L165 11 L190 42 L260 42 Z" fill="url(#rangeFill)" />
          <path d="M0 42 L70 42 L95 11 L165 11 L190 42 L260 42" fill="none" stroke="#8b7bf5" strokeWidth="1.6" strokeLinejoin="round" />
          <line x1="130" y1="6" x2="130" y2="42" stroke="#2ee6a8" strokeWidth="1.4" strokeDasharray="3 3" />
          <circle cx="130" cy="6" r="2.6" fill="#2ee6a8" />
        </svg>
        <div className="precision-price">live price $78,125</div>
      </div>
      <div className="precision-chips">
        <span className="precision-chip"><span className="dot" style={{background: "var(--violet)"}}></span>Precision-placed</span>
        <span className="precision-chip"><span className="dot" style={{background: "var(--mint)"}}></span>Rebalanced</span>
        <span className="precision-chip"><span className="dot" style={{background: "var(--gold)"}}></span>IL-protected</span>
      </div>
      </div>
    </div>

    <div className="dep-details" id="depDetails">
      <button className="dep-det-toggle" id="depDetToggle" type="button" aria-expanded="false" aria-controls="depDetBody">
        <span>Yield, settlement & protection</span>
        <span className="dep-det-link">Details<svg className="dep-det-chev" width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      <div className="m-rows dep-det-body" id="depDetBody">
        <div className="m-row"><span className="k">Projected yield</span><span className="v mint">≈28.5% / yr · capped at 30%</span></div>
        <div className="m-row"><span className="k">Fees settle</span><span className="v">Weekly · auto-compound</span></div>
        <div className="m-row"><span className="k">Protection</span><span className="v gold">IL Shield · covered first</span></div>
      </div>
    </div>

    <div className="notice green">
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none"><path d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z" stroke="#2ee6a8" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      <span>Balcore protects your deposit by <b>token count</b>, not dollar value — the quantity of each token you put in is the quantity it works to preserve. Non-custodial — your keys, your control.</span>
    </div>

    <button className="cta" id="depCta" disabled={true}>Enter an amount</button>
    <div className="br-done" id="depDone" hidden={true}>
      <div className="bd-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      <h3>Deposit confirmed</h3>
      <div className="bd-amt" id="depDoneAmt"></div>
      <button className="cta" id="depDoneClose">Done</button>
    </div>
    <div className="m-foot">Illustrative figures. Returns vary with market conditions.</div>
    </div>
  </div>
</div>


<div className="overlay" id="ovWithdraw" role="dialog" aria-modal="true" aria-labelledby="wdTitle">
  <div className="modal">
    <div className="m-head">
      <h2 id="wdTitle">Withdraw</h2>
      <button className="m-close" data-close={true} aria-label="Close">✕</button>
    </div>
    <p className="m-sub">Withdrawals settle on the weekly cycle.</p>

    <button className="pool-pick pool-pick-btn" id="wdPoolBtn" type="button" aria-haspopup="listbox" aria-expanded="false">
      <div className="pair-ic" id="wdPoolIc"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></div>
      <div style={{flex: "1", minWidth: "0", textAlign: "left"}}><div className="name" id="wdPoolName">Bitcoin / Dollar</div><div className="sub" id="wdPoolSub">Your position · $1,325,000</div></div>
      <div className="apy"><div className="v" id="wdPoolApy">30.0%</div><div className="k">/ YR · CAPPED</div></div>
      <svg className="pool-caret" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <div className="pool-menu" id="wdPoolMenu" role="listbox">
      <button className="pool-menu-item on" role="option" data-pool="btc" type="button"><span className="pair-ic"><span className="coin c-btc">₿</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Bitcoin / Dollar</span><span className="pmi-sub">$1,325,000 · 30.0% APY</span></span></button>
      <button className="pool-menu-item" role="option" data-pool="tsla" type="button"><span className="pair-ic"><span className="coin c-tsla">T</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Tesla / Dollar</span><span className="pmi-sub">$657,200 · 25.5% APY</span></span></button>
      <button className="pool-menu-item" role="option" data-pool="gold" type="button"><span className="pair-ic"><span className="coin c-gold">Au</span><span className="coin c-usd">$</span></span><span className="pmi-body"><span className="pmi-name">Gold / Dollar</span><span className="pmi-sub">$436,730 · 28.4% APY</span></span></button>
    </div>

    <div className="amt-box">
      <div className="amt-top"><span>Amount</span><span>In position: <span className="mono" style={{color: "var(--text-2)"}}>$1,325,000</span></span></div>
      <div className="amt-row">
        <input id="wdAmt" inputMode="decimal" placeholder="0.00" aria-label="Withdrawal amount in dollars" />
        <span className="unit">USD</span>
      </div>
    </div>
    <div className="quick" id="wdQuick">
      <button data-p="25">25%</button><button data-p="50">50%</button><button data-p="75">75%</button><button data-p="100">Max</button>
    </div>

    <div className="split">
      <div><div className="k">You receive · Bitcoin</div><div className="v" id="wdBtc">—</div></div>
      <div><div className="k">You receive · Dollars</div><div className="v" id="wdUsd">—</div></div>
    </div>

    <div className="wd-details" id="wdDetails">
      <button className="wd-det-toggle" id="wdDetToggle" type="button" aria-expanded="false" aria-controls="wdDetBody">
        <span>Settlement, fees & protection</span>
        <span className="wd-det-link">Details<svg className="wd-det-chev" width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      <div className="m-rows wd-det-body" id="wdDetBody">
        <div className="m-row"><span className="k">Settles</span><span className="v" id="wdSettle">Mon 23:00 UTC</span></div>
        <div className="m-row"><span className="k">This week's fees</span><span className="v mint">Included · +$13,120 accruing</span></div>
        <div className="m-row"><span className="k">Until then</span><span className="v">Keeps earning at ≈28.5% / yr</span></div>
        <div className="m-row"><span className="k">Protected by</span><span className="v gold">Token count · you get your quantities back</span></div>
      </div>
    </div>

    <div className="card-label" style={{marginBottom: "9px"}}>Withdrawal speed</div>
    <div className="speed-opts" id="wdSpeed">
      <div className="speed-opt on" data-speed="standard">
        <span className="speed-radio"></span>
        <div className="speed-body">
          <div className="speed-name">Standard <span className="speed-tag rec">RECOMMENDED</span></div>
          <div className="speed-sub">Funds arrive on the weekly cycle · ~7 days</div>
        </div>
        <div className="speed-meta"><div className="speed-fee free">No fee</div><div className="speed-note">full payout</div></div>
      </div>
      <div className="speed-opt" data-speed="fast">
        <span className="speed-radio"></span>
        <div className="speed-body">
          <div className="speed-name">Fast-Track <span className="speed-tag pri">PRIORITY</span></div>
          <div className="speed-sub">Unwound early from reserve · 24–48 hours</div>
        </div>
        <div className="speed-meta"><div className="speed-fee">3% fee</div><div className="speed-note" id="fastFee">≈ $0</div></div>
      </div>
    </div>

    <div className="notice">
      <svg width="14" height="14" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="6" stroke="#e0b25c" strokeWidth="1.5" /><path d="M8.5 5v3.5l2.4 2" stroke="#e0b25c" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <span id="wdNotice">Your funds keep making markets until settlement, then arrive in your wallet — no further action needed.</span>
    </div>

    <button className="cta" id="wdCta" disabled={true}>Enter an amount</button>
    <div className="m-foot">Requests can be cancelled any time before the weekly cutoff.</div>
  </div>
</div>
    </>
  );
}
