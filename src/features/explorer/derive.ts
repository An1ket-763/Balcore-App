import {
  applyWaterfall,
  PeriodRecord,
  RANGES,
  RANGE_TOTALS,
  RESERVE_ASSETS,
  RangeKey,
  SCOPES,
} from "./data";
import type { LiveState } from "./live";

export type PeriodId = string; // "range" or a scope record id

export function currentScope(range: RangeKey): PeriodRecord[] {
  return SCOPES[range];
}

export function isLiveView(range: RangeKey, period: PeriodId) {
  if (range === "1W") return false;
  const scope = currentScope(range);
  return period === "range" || period === scope[scope.length - 1]?.id;
}

function baseCurrentData(range: RangeKey, period: PeriodId): PeriodRecord {
  const scope = currentScope(range);
  if (period !== "range") {
    return (
      scope.find((x) => x.id === period) ??
      ({
        id: "range",
        short: RANGES[range].total,
        ...applyWaterfall({ ...RANGE_TOTALS[range] }),
        label: RANGES[range].label,
      } as PeriodRecord)
    );
  }
  const keys = [
    "fees",
    "il",
    "dist",
    "netAfterIL",
    "baseProtocol",
    "surplus",
    "surplusVault",
    "protocolSurplus",
    "rev",
    "difference",
  ] as const;
  const total: Record<string, number> = { tvl: 24600000 };
  scope.forEach((r) => {
    keys.forEach((k) => {
      total[k] = (total[k] ?? 0) + (r[k] ?? 0);
    });
  });
  return {
    id: "range",
    label: RANGES[range].label,
    short: RANGES[range].total,
    ...(total as unknown as Omit<PeriodRecord, "id" | "label" | "short">),
  };
}

function withLiveOverlay(base: PeriodRecord, range: RangeKey, period: PeriodId, live: LiveState): PeriodRecord {
  if (!isLiveView(range, period)) return { ...base };
  return applyWaterfall({
    ...base,
    tvl: Math.max(0, base.tvl + live.tvlDelta),
    fees: Math.max(0, base.fees + live.feesDelta),
    il: Math.max(0, base.il + live.ilDelta),
    dist: Math.max(0, base.dist + live.distDelta),
  }) as PeriodRecord;
}

export function currentData(range: RangeKey, period: PeriodId, live: LiveState): PeriodRecord {
  return withLiveOverlay(baseCurrentData(range, period), range, period, live);
}

export function liveScope(range: RangeKey, period: PeriodId, live: LiveState): PeriodRecord[] {
  const scope = currentScope(range).map((r) => ({ ...r }));
  if (isLiveView(range, period) && scope.length) {
    const i = scope.length - 1;
    scope[i] = withLiveOverlay(scope[i] as PeriodRecord, range, period, live);
  }
  return scope;
}

export function selectedIndex(range: RangeKey, period: PeriodId) {
  return period === "range" ? -1 : currentScope(range).findIndex((x) => x.id === period);
}

export interface ReserveRow {
  id: string;
  asset: string;
  scope: string;
  pools: string;
  reserveScope: string;
  reserve: number;
  active: number;
  total: number;
  reservePct: number;
  activePct: number;
}

export function reserveSnapshot(range: RangeKey, period: PeriodId, live: LiveState): ReserveRow[] {
  const baseTotal = RESERVE_ASSETS.reduce((s, a) => s + a.reserve + a.active, 0);
  return RESERVE_ASSETS.map((a) => {
    const share = (a.reserve + a.active) / baseTotal;
    const delta = isLiveView(range, period) ? Math.round(live.tvlDelta * share) : 0;
    const reserve = Math.max(0, Math.round(a.reserve + delta * 0.35));
    const active = Math.max(0, Math.round(a.active + delta * 0.65));
    const total = reserve + active;
    const reservePct = total ? (reserve / total) * 100 : 0;
    return { ...a, reserve, active, total, reservePct, activePct: 100 - reservePct };
  });
}

/** Series used by the sparkline/bar chart; TVL gets a shaped curve. */
export function metricSeries(records: PeriodRecord[], key: keyof PeriodRecord): number[] {
  if (key !== "tvl") return records.map((x) => Number(x[key] ?? 0));
  const n = records.length;
  return records.map((x, i) => {
    const progress = n <= 1 ? 1 : i / (n - 1);
    const shape = 0.895 + 0.105 * progress + 0.012 * Math.sin(i * 1.67);
    return Math.round(Number(x.tvl ?? 24600000) * shape);
  });
}
