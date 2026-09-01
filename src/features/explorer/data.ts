/**
 * Balcore Explorer prototype dataset + settlement math.
 * Ported verbatim from the standalone HTML prototype so the numbers match.
 */

export type RangeKey = "1W" | "1M" | "6M" | "1Y" | "ALL";

export const fmt = (n: number) =>
  "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const RANGES: Record<RangeKey, { label: string; unit: string; total: string }> = {
  "1W": {
    label: "Last week · Epoch 214 · Jul 6–12 · settled Mon Jul 13",
    unit: "day",
    total: "Whole epoch",
  },
  "1M": { label: "July 2026 · month to date", unit: "week", total: "Whole month" },
  "6M": { label: "February–July 2026", unit: "month", total: "Entire 6 months" },
  "1Y": { label: "August 2025–July 2026", unit: "month", total: "Entire 12 months" },
  ALL: { label: "January 2025–July 2026", unit: "month", total: "Since launch" },
};

export type MetricKey = "tvl" | "fees" | "dist" | "il" | "surplusVault";

export const METRICS: Record<
  MetricKey,
  { title: string; class: string; sub: string; source: string; event: string; method: string }
> = {
  tvl: {
    title: "Total liquidity",
    class: "",
    sub: "POL plus user liquidity",
    source: "Vault share and treasury balance reads",
    event: "Verified contract reads",
    method: "POL balance + user vault balances",
  },
  fees: {
    title: "Fees collected",
    class: "",
    sub: "Converted to USDC at repositions",
    source: "Treasury 0xBA1c…04e7",
    event: "FeeVaultDeposit",
    method: "Sum of USDC vault deposits at repositions",
  },
  dist: {
    title: "Paid to LPs",
    class: "mint",
    sub: "User income, capped at 30% annualized",
    source: "Treasury 0xBA1c…04e7",
    event: "DistributedToLPs",
    method: "Sum user distribution events",
  },
  il: {
    title: "IL covered",
    class: "gold",
    sub: "Paid by Shield before any payout",
    source: "Shield Vault 0x51e1…d770",
    event: "ILCovered",
    method: "Sum event amount values",
  },
  surplusVault: {
    title: "Surplus Vault top-up",
    class: "violet",
    sub: "70% of income left above the user cap",
    source: "Surplus Vault 0x5A70…118e",
    event: "SurplusVaultTopUp",
    method: "Sum the 70% surplus allocation events",
  },
};

export const RANGE_TOTALS: Record<RangeKey, { fees: number; dist: number; il: number; tvl: number }> = {
  "1W": { fees: 197700, dist: 61882, il: 6800, tvl: 24600000 },
  "1M": { fees: 466100, dist: 312400, il: 28000, tvl: 24600000 },
  "6M": { fees: 2612000, dist: 1729000, il: 151000, tvl: 24600000 },
  "1Y": { fees: 4890000, dist: 3214000, il: 296000, tvl: 24600000 },
  ALL: { fees: 6110554, dist: 3742800, il: 371200, tvl: 24600000 },
};

export interface PeriodRecord {
  id: string;
  label: string;
  short: string;
  tvl: number;
  fees: number;
  il: number;
  dist: number;
  netAfterIL: number;
  baseProtocol: number;
  surplus: number;
  surplusVault: number;
  protocolSurplus: number;
  rev: number;
  difference: number;
}

export function applyWaterfall<T extends { fees: number; il: number; dist: number; tvl: number }>(
  input: T,
): T & Omit<PeriodRecord, "id" | "label" | "short"> {
  const r = { ...input } as T & Omit<PeriodRecord, "id" | "label" | "short">;
  r.netAfterIL = Math.max(0, r.fees - r.il);
  r.baseProtocol = Math.round(r.fees * 0.05);
  const availableForUsers = Math.max(0, r.netAfterIL - r.baseProtocol);
  r.dist = Math.min(r.dist, availableForUsers);
  r.surplus = Math.max(0, availableForUsers - r.dist);
  r.surplusVault = Math.round(r.surplus * 0.7);
  r.protocolSurplus = r.surplus - r.surplusVault;
  r.rev = r.baseProtocol + r.protocolSurplus;
  r.difference = r.fees - (r.il + r.baseProtocol + r.dist + r.surplusVault + r.protocolSurplus);
  return r;
}

function allocate(
  defs: { id: string; label: string; short: string }[],
  fees: number[],
  total: { fees: number; dist: number; il: number },
): PeriodRecord[] {
  const acc = { il: 0, dist: 0 };
  return defs.map((d, i) => {
    const r = { ...d, fees: fees[i], tvl: 24600000, il: 0, dist: 0 };
    if (i === defs.length - 1) {
      r.il = total.il - acc.il;
      r.dist = total.dist - acc.dist;
    } else {
      r.il = Math.round((r.fees * total.il) / total.fees);
      r.dist = Math.round((r.fees * total.dist) / total.fees);
      acc.il += r.il;
      acc.dist += r.dist;
    }
    return applyWaterfall(r) as PeriodRecord;
  });
}

const DAYS = allocate(
  [
    { id: "d1", label: "Mon · Jul 6", short: "Mon 6" },
    { id: "d2", label: "Tue · Jul 7", short: "Tue 7" },
    { id: "d3", label: "Wed · Jul 8", short: "Wed 8" },
    { id: "d4", label: "Thu · Jul 9", short: "Thu 9" },
    { id: "d5", label: "Fri · Jul 10", short: "Fri 10" },
    { id: "d6", label: "Sat · Jul 11", short: "Sat 11" },
    { id: "d7", label: "Sun · Jul 12", short: "Sun 12" },
  ],
  [26400, 27800, 29900, 31200, 30100, 28600, 23700],
  RANGE_TOTALS["1W"],
);

const WEEKS = allocate(
  [
    { id: "w1", label: "Week 1 · Jul 1–5", short: "Jul 1–5" },
    { id: "w2", label: "Week 2 · Jul 6–12", short: "Jul 6–12" },
    { id: "w3", label: "Week 3 · Jul 13–19", short: "Jul 13–19" },
  ],
  [160000, 197700, 108400],
  RANGE_TOTALS["1M"],
);

const MONTH_DEFS = ["Feb 26", "Mar 26", "Apr 26", "May 26", "Jun 26", "Jul 26"].map((x, i) => ({
  id: "m" + i,
  label: ["February", "March", "April", "May", "June", "July"][i] + " 2026",
  short: x,
}));

const MONTHS6 = allocate(MONTH_DEFS, [410000, 425000, 436000, 438000, 436900, 466100], RANGE_TOTALS["6M"]);

const MONTHS12 = allocate(
  Array.from({ length: 12 }, (_, i) => ({
    id: "y" + i,
    label: new Date(2025, 7 + i, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    short: new Date(2025, 7 + i, 1).toLocaleString("en-US", { month: "short", year: "2-digit" }),
  })),
  [340000, 355000, 370000, 385000, 400000, 428000, 410000, 425000, 436000, 438000, 436900, 466100],
  RANGE_TOTALS["1Y"],
);

export const MONTHSALL = allocate(
  Array.from({ length: 19 }, (_, i) => ({
    id: "a" + i,
    label: new Date(2025, i, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    short: new Date(2025, i, 1).toLocaleString("en-US", { month: "short", year: "2-digit" }),
  })),
  [
    130000, 145000, 160000, 175000, 190000, 205000, 215554, 340000, 355000, 370000, 385000, 400000,
    428000, 410000, 425000, 436000, 438000, 436900, 466100,
  ],
  RANGE_TOTALS.ALL,
);

export const SCOPES: Record<RangeKey, PeriodRecord[]> = {
  "1W": DAYS,
  "1M": WEEKS,
  "6M": MONTHS6,
  "1Y": MONTHS12,
  ALL: MONTHSALL,
};

export const EVENTS = [
  {
    type: "fee",
    name: "FeeVaultDeposit",
    payload: "AVAX/USDC · 4,120.55 USDC · at reposition",
    age: "2 min",
    tx: "0x8f2a…c91d",
  },
  {
    type: "il",
    name: "ILCovered",
    payload: "Position 8841 · 1,204.33 USDC · settled first",
    age: "3 hr",
    tx: "0x9dd4…1e08",
  },
  {
    type: "fee",
    name: "FeeVaultDeposit",
    payload: "ETH/USDC · 2,940.18 USDC · at reposition",
    age: "5 hr",
    tx: "0xd402…6b17",
  },
  {
    type: "proto",
    name: "ProtocolFeeCaptured",
    payload: "5% of converted income · 2,330.50 USDC",
    age: "4 hr",
    tx: "0xa11c…205f",
  },
  {
    type: "dist",
    name: "DistributedToLPs",
    payload: "Epoch 214 · 61,882.10 USDC · 1,142 wallets",
    age: "6 hr",
    tx: "0x3be0…77a2",
  },
  {
    type: "res",
    name: "SurplusVaultTopUp",
    payload: "70% of remaining surplus · 8,455.00 USDC",
    age: "1 day",
    tx: "0xe20a…4d55",
  },
];

export const PROVIDERS = [
  {
    name: "Balcore Protocol-Owned Liquidity",
    address: "Balcore Inc liquidity",
    fullAddress: "POL",
    type: "POL",
    liq: 8400000,
    share: "34.1%",
    fees: 1276400,
    pos: "4 pools",
    status: "Active",
  },
  {
    name: "0xdeA7…9db3",
    address: "User wallet",
    fullAddress: "0xdeA7000000000000000000000000000000009db3",
    type: "USER",
    liq: 274120,
    share: "1.11%",
    fees: 28460,
    pos: "2",
    status: "Active",
  },
  {
    name: "0x8C41…7A20",
    address: "User wallet",
    fullAddress: "0x8C41000000000000000000000000000000007A20",
    type: "USER",
    liq: 241800,
    share: "0.98%",
    fees: 22910,
    pos: "2",
    status: "Active",
  },
  {
    name: "0x19F2…B113",
    address: "User wallet",
    fullAddress: "0x19F200000000000000000000000000000000B113",
    type: "USER",
    liq: 198450,
    share: "0.81%",
    fees: 18770,
    pos: "1",
    status: "Active",
  },
  {
    name: "0xAA72…41D9",
    address: "User wallet",
    fullAddress: "0xAA720000000000000000000000000000000041D9",
    type: "USER",
    liq: 176900,
    share: "0.72%",
    fees: 15440,
    pos: "2",
    status: "Active",
  },
  {
    name: "2,233 additional wallets",
    address: "Aggregated user liquidity",
    fullAddress: "AGGREGATE",
    type: "USER",
    liq: 15308730,
    share: "62.23%",
    fees: 2380820,
    pos: "2,901",
    status: "Active",
  },
];

export interface WalletPosition {
  id: string;
  pair: string;
  deposited: number;
  current: number;
  fees: number;
  il: number;
  distributed: number;
  range: string;
  status: string;
}

export interface WalletProfile {
  deposited: number;
  current: number;
  fees: number;
  distributed: number;
  claimable: number;
  il: number;
  withdrawn: number;
  shareUser: string;
  firstDeposit: string;
  lastSettlement: string;
  positions: WalletPosition[];
  events: { type: string; detail: string; amount: number; age: string; tx: string }[];
}

export const WALLET_PROFILES: Record<string, WalletProfile> = {
  "0xdea7000000000000000000000000000000009db3": {
    deposited: 250000,
    current: 274120,
    fees: 28460,
    distributed: 22800,
    claimable: 5660,
    il: 4340,
    withdrawn: 0,
    shareUser: "1.69%",
    firstDeposit: "Apr 18, 2026",
    lastSettlement: "Jul 18, 2026",
    positions: [
      {
        id: "8841",
        pair: "AVAX / USDC",
        deposited: 140000,
        current: 153540,
        fees: 16280,
        il: 2740,
        distributed: 12960,
        range: "$21.40–$34.20",
        status: "In range",
      },
      {
        id: "9017",
        pair: "BTC.b / USDC",
        deposited: 110000,
        current: 120580,
        fees: 12180,
        il: 1600,
        distributed: 9840,
        range: "$58K–$76K",
        status: "In range",
      },
    ],
    events: [
      { type: "Distribution", detail: "Epoch 214 · LP payout received", amount: 6420, age: "6 hr", tx: "0x3be0…77a2" },
      { type: "IL covered", detail: "Position 8841 · restored before payout", amount: 1204, age: "3 hr", tx: "0x9dd4…1e08" },
      { type: "Fee allocation", detail: "AVAX / USDC · wallet share", amount: 811, age: "2 min", tx: "0x8f2a…c91d" },
      { type: "Settlement", detail: "Week 28 · both positions settled", amount: 0, age: "1 day", tx: "0x7c11…e921" },
    ],
  },
  "0x8c41000000000000000000000000000000007a20": {
    deposited: 225000,
    current: 241800,
    fees: 22910,
    distributed: 18150,
    claimable: 4760,
    il: 3620,
    withdrawn: 0,
    shareUser: "1.49%",
    firstDeposit: "May 2, 2026",
    lastSettlement: "Jul 18, 2026",
    positions: [
      {
        id: "8872",
        pair: "AVAX / USDC",
        deposited: 125000,
        current: 134400,
        fees: 13100,
        il: 2140,
        distributed: 10450,
        range: "$20.80–$33.70",
        status: "In range",
      },
      {
        id: "8964",
        pair: "XAUT / USDC",
        deposited: 100000,
        current: 107400,
        fees: 9810,
        il: 1480,
        distributed: 7700,
        range: "$2,300–$2,650",
        status: "In range",
      },
    ],
    events: [
      { type: "Distribution", detail: "Epoch 214 · LP payout received", amount: 5130, age: "6 hr", tx: "0x3be0…81b4" },
      { type: "Fee allocation", detail: "XAUT / USDC · wallet share", amount: 614, age: "3 hr", tx: "0x8f2a…72aa" },
      { type: "Settlement", detail: "Week 28 · both positions settled", amount: 0, age: "1 day", tx: "0x7c11…4d21" },
    ],
  },
  "0x19f200000000000000000000000000000000b113": {
    deposited: 190000,
    current: 198450,
    fees: 18770,
    distributed: 15210,
    claimable: 3560,
    il: 2880,
    withdrawn: 0,
    shareUser: "1.23%",
    firstDeposit: "May 16, 2026",
    lastSettlement: "Jul 18, 2026",
    positions: [
      {
        id: "8913",
        pair: "BTC.b / USDC",
        deposited: 190000,
        current: 198450,
        fees: 18770,
        il: 2880,
        distributed: 15210,
        range: "$57K–$78K",
        status: "In range",
      },
    ],
    events: [
      { type: "Distribution", detail: "Epoch 214 · LP payout received", amount: 4210, age: "6 hr", tx: "0x3be0…13f2" },
      { type: "IL covered", detail: "Position 8913 · restored before payout", amount: 806, age: "3 hr", tx: "0x9dd4…113a" },
      { type: "Settlement", detail: "Week 28 · position settled", amount: 0, age: "1 day", tx: "0x7c11…b811" },
    ],
  },
  "0xaa720000000000000000000000000000000041d9": {
    deposited: 165000,
    current: 176900,
    fees: 15440,
    distributed: 12100,
    claimable: 3340,
    il: 2440,
    withdrawn: 0,
    shareUser: "1.09%",
    firstDeposit: "Jun 1, 2026",
    lastSettlement: "Jul 18, 2026",
    positions: [
      {
        id: "9042",
        pair: "AVAX / USDC",
        deposited: 90000,
        current: 97200,
        fees: 8640,
        il: 1410,
        distributed: 6820,
        range: "$22.10–$35.00",
        status: "In range",
      },
      {
        id: "9051",
        pair: "XAUT / USDC",
        deposited: 75000,
        current: 79700,
        fees: 6800,
        il: 1030,
        distributed: 5280,
        range: "$2,320–$2,690",
        status: "In range",
      },
    ],
    events: [
      { type: "Distribution", detail: "Epoch 214 · LP payout received", amount: 3380, age: "6 hr", tx: "0x3be0…41d9" },
      { type: "Fee allocation", detail: "AVAX / USDC · wallet share", amount: 492, age: "2 min", tx: "0x8f2a…41d9" },
      { type: "Settlement", detail: "Week 28 · both positions settled", amount: 0, age: "1 day", tx: "0x7c11…41d9" },
    ],
  },
};

export const POOLS = [
  { name: "AVAX / USDC", total: 9600000, pol: 3300000, users: 6300000, providers: 962 },
  { name: "BTC.b / USDC", total: 6400000, pol: 2200000, users: 4200000, providers: 526 },
  { name: "ETH / USDC", total: 4900000, pol: 1600000, users: 3300000, providers: 438 },
  { name: "XAUT / USDC", total: 3700000, pol: 1300000, users: 2400000, providers: 311 },
];

export const RESERVE_ASSETS = [
  {
    id: "usdc",
    asset: "USDC",
    reserve: 8600000,
    active: 2500000,
    scope: "Treasury, Shield and all live quote inventory",
    pools: "AVAX / USDC · BTC.b / USDC · ETH / USDC · XAUT / USDC",
    reserveScope: "Treasury 0xBA1c…04e7 · Shield 0x51e1…d770 · Surplus 0x5A70…118e",
  },
  {
    id: "avax",
    asset: "AVAX",
    reserve: 3400000,
    active: 1200000,
    scope: "Base AVAX inventory",
    pools: "AVAX / USDC",
    reserveScope: "Reserve AVAX wallet + strategy vaults",
  },
  {
    id: "weth",
    asset: "WETH",
    reserve: 2600000,
    active: 1000000,
    scope: "Wrapped Ether inventory",
    pools: "ETH / USDC",
    reserveScope: "Reserve WETH wallet + strategy vaults",
  },
  {
    id: "btcb",
    asset: "BTC.b",
    reserve: 2100000,
    active: 1000000,
    scope: "Wrapped Bitcoin inventory",
    pools: "BTC.b / USDC",
    reserveScope: "Reserve BTC.b wallet + strategy vaults",
  },
  {
    id: "xaut",
    asset: "XAUT",
    reserve: 1200000,
    active: 1000000,
    scope: "Gold-backed token inventory",
    pools: "XAUT / USDC",
    reserveScope: "Reserve XAUT wallet + strategy vaults",
  },
];

export const DEBT = {
  floor: 1.5,
  positions: [
    {
      venue: "Benqi",
      asset: "USDC",
      borrowed: 1400000,
      hf: 1.86,
      getter: "getAccountLiquidity",
      collateral: "58k AVAX",
      deployed: "AVAX/USDC bids",
    },
    {
      venue: "Aave v3",
      asset: "USDC",
      borrowed: 700000,
      hf: 2.04,
      getter: "getUserAccountData",
      collateral: "12.4 BTC.b",
      deployed: "ETH/USDC bids",
    },
  ],
};

const PRICES: Record<string, number> = { USDC: 1, AVAX: 38.21, WETH: 3600, "BTC.b": 118000, XAUT: 2480 };
const TOK_DEC: Record<string, number> = { USDC: 0, AVAX: 0, WETH: 2, "BTC.b": 3, XAUT: 1 };

export const tokf = (asset: string, usd: number) => {
  const p = PRICES[asset] || 1;
  return (
    (usd / p).toLocaleString("en-US", { maximumFractionDigits: TOK_DEC[asset] ?? 0 }) + " " + asset
  );
};

export const shortAddress = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

export function walletProfile(address: string) {
  return WALLET_PROFILES[address.toLowerCase()] ?? null;
}

export function csv(name: string, rows: (string | number)[][]) {
  const text = rows
    .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([text], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
