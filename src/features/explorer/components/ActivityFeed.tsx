import { EVENTS } from "../data";

export default function ActivityFeed({ onEventProof }: { onEventProof: (index: number) => void }) {
  return (
    <div className="section">
      <div className="section-head">
        <div>
          <h2>Recent verified activity</h2>
          <p>Only the latest protocol actions</p>
        </div>
      </div>
      <div className="feed">
        {EVENTS.map((e, i) => (
          <div className="feed-row" key={e.tx}>
            <span className={`event-name ${e.type}`}>{e.name}</span>
            <span className="payload">{e.payload}</span>
            <span className="age">{e.age}</span>
            <span className="tx">
              <button onClick={() => onEventProof(i)}>{e.tx} ↗</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
