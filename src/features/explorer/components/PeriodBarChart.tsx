import type { PeriodRecord } from "../data";
import { metricSeries } from "../derive";

const compact = (v: number) =>
  v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v);

/** Selectable bar chart shown inside the proof drawer. */
export default function PeriodBarChart({
  records,
  metricKey,
  color,
  focus,
  unit,
  onSelect,
}: {
  records: PeriodRecord[];
  metricKey: keyof PeriodRecord;
  color: string;
  focus: number;
  unit: string;
  onSelect: (id: string) => void;
}) {
  const vals = metricSeries(records, metricKey);
  const W = 460;
  const H = 110;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const gap = Math.max(4, Math.min(9, 70 / records.length));
  const bw = (W - gap * (records.length - 1)) / records.length;

  return (
    <>
      <div className="chart-hint">Select any bar to inspect that {unit}</div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%">
        {records.map((r, i) => {
          const v = vals[i] ?? 0;
          const h = 12 + ((v - min) / span) * (H - 26);
          const x = i * (bw + gap);
          const y = H - h;
          const sel = i === focus;
          const showVal = records.length <= 8 || sel;
          return (
            <g
              key={r.id}
              className={`period-bar${sel ? " selected" : ""}`}
              tabIndex={0}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.id);
                }
              }}
            >
              <rect className="bar-hit" x={x} y={0} width={bw} height={H + 22} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={bw}
                height={h}
                rx={4}
                fill={color}
                opacity={sel ? 1 : 0.5}
                stroke={sel ? color : "none"}
                strokeWidth={sel ? 1.5 : 0}
              />
              {showVal && (
                <text
                  x={x + bw / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={records.length > 8 ? 8 : 9.5}
                  fontWeight={700}
                  fontFamily="monospace"
                  fill={sel ? color : "#8e92aa"}
                >
                  {compact(v)}
                </text>
              )}
              <text
                x={x + bw / 2}
                y={H + 16}
                textAnchor="middle"
                fontSize={records.length > 12 ? 7 : 9}
                fontFamily="monospace"
                fill="#6f7289"
              >
                {r.short}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
