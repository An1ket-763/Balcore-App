import { Fragment } from "react";
import { LOGO } from "../logo";
import { getActivity } from "../data/activity";

export default function ActivityView() {
  const items = getActivity();
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
          {items.length === 0 ? (
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

    
    <footer className="app-foot">
      <a className="app-foot-brand" href="#"><img src={LOGO} width="26" height="26" alt="" /> Balcore</a>
      <nav className="app-foot-nav">
        <a href="#">Home</a>
        <a href="#">Docs</a>
        <a href="#">Whitepaper</a>
        <a href="#">Team</a>
        <a className="is-social" href="https://x.com/Balcore_ai" target="_blank" rel="noopener" aria-label="Balcore on X" title="Balcore on X"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" /></svg></a>
        <a className="is-social" href="#" target="_blank" rel="noopener">Arena</a>
        <a className="is-social" href="#" target="_blank" rel="noopener"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" /></svg>Discord</a>
      </nav>
    </footer>
    </>
  );
}
