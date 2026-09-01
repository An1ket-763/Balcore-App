import { fmt, METRICS, RANGES, type MetricKey, type PeriodRecord, type RangeKey } from "../data";

const CARDS: MetricKey[] = ["tvl", "fees", "il", "dist", "surplusVault"];

export default function KpiGrid({
  data,
  scopeLength,
  range,
  live,
  onOpenProof,
}: {
  data: PeriodRecord;
  scopeLength: number;
  range: RangeKey;
  live: boolean;
  onOpenProof: (key: MetricKey) => void;
}) {
  return (
    <div className="kpis">
      {CARDS.map((key) => {
        const m = METRICS[key];
        const val = data[key] as number;
        const chip =
          key === "tvl"
            ? "34.1% POL · 65.9% users"
            : key === "fees"
              ? live
                ? "Realized at repositions"
                : range === "1W"
                  ? "Epoch settled · final"
                  : `${scopeLength} ${RANGES[range].unit}s in view`
              : key === "dist"
                ? "Updates at payout events"
                : key === "surplusVault"
                  ? "Updates at settlement"
                  : `${((data.il / Math.max(data.fees, 1)) * 100).toFixed(1)}% of fees`;
        return (
          <article
            className="kpi"
            key={key}
            tabIndex={0}
            role="button"
            aria-label={`View proof for ${m.title}`}
            onClick={() => onOpenProof(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenProof(key);
              }
            }}
          >
            <div className="kpi-top">
              <span>
                {m.title}
                {live && <span className="live-chip">live</span>}
              </span>
              <span className="proof">VIEW PROOF ↗</span>
            </div>
            <div className={`kpi-val live-value ${m.class}`}>{fmt(val)}</div>
            <div className="kpi-sub">{m.sub}</div>
            <span className="chip">{chip}</span>
          </article>
        );
      })}
    </div>
  );
}
