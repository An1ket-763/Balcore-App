import { getPositions } from "../data/positions";

export default function ProtocolView() {
  const positions = getPositions();
  return (
    <>
    <div className="view" id="viewProtocol" style={{display: "none"}}>
      <div className="proto-summary">
        <div className="flow-card">
          <div className="flow-head">
            <div><div className="card-label">Protocol flow</div><div className="flow-sub" id="flowSub">Fees collected and where they went</div></div>
            <div className="flow-toggle" id="flowToggle">
              <button data-p="1w" type="button">1W</button><button className="on" data-p="1m" type="button">1M</button><button data-p="6m" type="button">6M</button><button data-p="1y" type="button">1Y</button><button data-p="all" type="button">ALL</button>
            </div>
          </div>
          <div className="flow-row">
            <div className="flow-cell income flow-cell-btn" data-detail="income" role="button" tabIndex={0}><span className="fc-k">Fees collected<svg className="fc-chev" width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="fc-v mint" id="flowIncome">$466,100</span></div>
            <div className="flow-cell"><span className="fc-k">IL covered</span><span className="fc-v gold" id="flowIL">$28,000</span></div>
            <div className="flow-cell flow-cell-btn" data-detail="users" role="button" tabIndex={0}><span className="fc-k">Distributed to users<svg className="fc-chev" width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="fc-v mint" id="flowUsers">$312,400</span></div>
            <div className="flow-cell"><span className="fc-k">Protocol revenue</span><span className="fc-v" id="flowProto" style={{color: "var(--violet)"}}>$37,700</span></div>
            <div className="flow-cell"><span className="fc-k">Surplus reserve</span><span className="fc-v gold" id="flowReserve">$88,000</span></div>
          </div>
          <div className="flow-detail" id="flowDetailIncome" hidden={true}>
            <div className="fd-title">Fees collected · by pool</div>
            <div className="fd-row"><span>Bitcoin / Dollar</span><span className="mono" id="fdIncBtc">$262,900</span></div>
            <div className="fd-row"><span>Tesla / Dollar</span><span className="mono" id="fdIncTsla">$120,700</span></div>
            <div className="fd-row"><span>Gold / Dollar</span><span className="mono" id="fdIncGold">$82,500</span></div>
          </div>
          <div className="flow-detail" id="flowDetailUsers" hidden={true}>
            <div className="fd-title">Distributed to users · by pool</div>
            <div className="fd-row"><span>Bitcoin / Dollar</span><span className="mono" id="fdUsrBtc">$176,200</span></div>
            <div className="fd-row"><span>Tesla / Dollar</span><span className="mono" id="fdUsrTsla">$80,900</span></div>
            <div className="fd-row"><span>Gold / Dollar</span><span className="mono" id="fdUsrGold">$55,300</span></div>
          </div>
        </div>
      </div>
      <div className="proto-page">
        <div className="proto-col-main">

          <div className="card hoverpop">
            <div className="card-label" style={{marginBottom: "14px"}}>Capital deployment</div>
            <div className="dep-total">
              <div><div className="dep-k">Total value locked</div><div className="dep-v">$24.6M</div></div>
              <div style={{textAlign: "right"}}><div className="dep-k">7-day change</div><div className="dep-v" style={{fontSize: "16px", color: "var(--mint)"}}>+4.2%</div></div>
            </div>
            <div className="dep-bar"><span className="dep-work" style={{width: "20%"}}></span><span className="dep-res" style={{width: "80%"}}></span></div>
            <div className="dep-legend">
              <div className="row"><span className="name"><span className="dot" style={{background: "var(--violet)"}}></span>Deployed · making markets</span><b>$4.92M · 20%</b></div>
              <div className="row"><span className="name"><span className="dot" style={{background: "var(--mint)"}}></span>In reserve · safety buffer</span><b>$19.68M · 80%</b></div>
            </div>
            <div className="dep-foot">
              <span style={{display: "flex", alignItems: "center", gap: "7px"}}>
                <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M8.5 2 14 4.3v4c0 3.2-2.2 5.6-5.5 6.7C5.2 13.9 3 11.5 3 8.3v-4L8.5 2Z" stroke="#e0b25c" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                IL Shield vault
              </span>
              <span className="mono" style={{color: "var(--gold)"}}>$1.84M · covers IL first</span>
            </div>
          </div>

          <div className="card hoverpop">
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px"}}>
              <div className="card-label">The engine</div>
              <span className="live-pill" style={{padding: "4px 10px"}}><span className="live-dot"></span>Live</span>
            </div>
            <div className="eng-row"><span className="k">Market regime</span><span className="v regime" id="regimeNow" data-regime="calm"><span className="reg-dot"></span><span className="reg-label">Calm</span> <span className="reg-desc">— ranges tight, fees compounding</span></span></div>
            <div className="eng-row"><span className="k">Volatility</span><span className="v" style={{display: "inline-flex", alignItems: "center", gap: "9px"}}><span className="vol-gauge" id="volGauge"><span className="vg-seg vg-1"></span><span className="vg-seg vg-2"></span><span className="vg-seg vg-3"></span><span className="vg-seg vg-4"></span></span><span className="vg-tier mono" id="volTier">Green · low</span></span></div>
            <div className="eng-row"><span className="k">IL covered</span><span className="v gold">$14,900 all-time <span style={{color: "var(--text-3)", fontWeight: "400"}}>· $1,180 this wk</span></span></div>
            <div className="eng-row"><span className="k">Surplus reserve</span><span className="v gold">$1.84M <span style={{color: "var(--text-3)", fontWeight: "400"}}>· 70% of yield past the 30% cap</span></span></div>
            <div className="eng-row"><span className="k">Active pools</span><span className="v">3</span></div>
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
                <div><span className="ct-k">Last rebalance</span><span className="ct-v" id="cycleLast">2d 6h ago</span></div>
              </div>
            </div>
          </div>

        </div>

        <div className="proto-col-side">
          <div className="card hoverpop mint-pop" style={{borderColor: "rgba(46,230,168,.28)"}}>
            <div className="card-label" style={{marginBottom: "6px"}}>Earned by LPs</div>
            <div style={{fontFamily: "var(--mono)", fontSize: "28px", color: "var(--mint)", margin: "2px 0 2px"}} data-countup="3742800" data-prefix="$" id="protoFees">$3,742,800</div>
            <div style={{fontSize: "12px", color: "var(--text-3)", marginBottom: "14px"}}>Paid out to LPs since launch · net of IL, fee & reserve</div>
            <div className="eng-row"><span className="k">Last 30 days</span><span className="v mint">+$312,400</span></div>
            <div className="eng-row"><span className="k">Last 7 days</span><span className="v mint">+$74,580</span></div>
            <div className="pool-fees" id="poolFees">
              <button className="pf-toggle" id="poolFeesToggle" type="button" aria-expanded="false" aria-controls="poolFeesBody">
                <span>Fees by pool · since launch</span>
                <span className="pf-link">Details<svg className="pf-chev" width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              </button>
              <div className="pf-body" id="poolFeesBody">
                <div className="eng-row"><span className="k">Bitcoin / Dollar</span><span className="v mint">$2,110,000</span></div>
                <div className="eng-row"><span className="k">Tesla / Dollar</span><span className="v mint">$969,000</span></div>
                <div className="eng-row"><span className="k">Gold / Dollar</span><span className="v mint">$663,800</span></div>
              </div>
            </div>
            <div className="fee-split">
              <div className="fee-split-h">How fees are shared</div>
              <div className="fee-split-row"><span>IL covered first, then 5% base protocol fee</span></div>
              <div className="fee-split-row"><span className="fsr-k">LPs earn</span><span className="fsr-v mint">up to 30% APY</span></div>
              <div className="fee-split-row"><span className="fsr-k">Surplus above the cap</span><span className="fsr-v">70% reserve · 30% protocol</span></div>
            </div>
          </div>

          <div className="card hoverpop">
            <div className="card-label" style={{marginBottom: "18px"}}>Positioning · where liquidity sits</div>

            {positions.length === 0 ? (
              <div className="act-empty">No positions yet — deposit to get started.</div>
            ) : (
              positions.map((p) => (
                <div className="pos-range" key={p.name}>
                  <div className="pr-head"><span className="pr-name">{p.name}</span><span className={"st " + p.status}><span className="d"></span>{p.statusLabel}</span></div>
                  <div className="pr-track"><div className={"pr-band" + (p.band.rebalancing ? " rb" : "")} style={{left: p.band.left, width: p.band.width}}></div><div className="pr-mark" style={{left: p.markLeft}}></div></div>
                  <div className="pr-labels"><span>{p.low}</span><span style={{color: p.midColor}}>{p.midLabel}</span><span>{p.high}</span></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
