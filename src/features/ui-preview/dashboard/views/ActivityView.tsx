import { Fragment } from "react";
import { useActivity } from "../data/activity";

export default function ActivityView() {
  const { items, isLoading, isError, isConnected } = useActivity();
  const days: string[] = [];
  items.forEach((i) => { if (!days.includes(i.day)) days.push(i.day); });
  return (
    <>
    <div className="view" id="viewActivity" style={{display: "none"}}>
      <div style={{maxWidth: "820px"}}>
        <div className="act-filters">
          <button className="on" data-afilter="all">All</button>
          <button data-afilter="fees">Fees</button>
          <button data-afilter="settlement">Settlements</button>
          <button data-afilter="rebalance">Rebalances</button>
          <button data-afilter="transfer">Deposits & withdrawals</button>
        </div>

        <div className="card" style={{padding: "8px 22px"}}>
          {!isConnected ? (
            <div className="act-empty">Connect your wallet to see your activity.</div>
          ) : isLoading ? (
            <div className="act-empty is-loading">Loading activity…</div>
          ) : isError ? (
            <div className="act-empty">Couldn’t load on-chain activity right now.</div>
          ) : items.length === 0 ? (
            <div className="act-empty">No activity yet.</div>
          ) : (
            <>
              {days.map((day) => (
                <Fragment key={day}>
                  <div className="act-day">{day}</div>
                  {items.filter((i) => i.day === day).map((i, idx) => (
                    <div className="act-item" data-atype={i.type} key={day + idx}>
                      <span className={"act-ic " + i.iconTone}>{i.icon}</span>
                      <div className="act-body"><div className="act-t">{i.title}</div><div className="act-s">{i.subtitle}</div></div>
                      <div className="act-meta"><div className={"act-v" + (i.valueTone ? " " + i.valueTone : "")}>{i.value}</div><div className="act-time">{i.time}</div></div>
                    </div>
                  ))}
                </Fragment>
              ))}
              <div className="act-empty" id="actEmpty" style={{display: "none"}}>No activity of this type yet.</div>
            </>
          )}
        </div>
      </div>
    </div>

    
    </>
  );
}
