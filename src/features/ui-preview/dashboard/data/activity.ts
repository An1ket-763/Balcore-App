import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { FUJI_USDC_ADDRESS } from "./balances";

export type ActivityType = "fees" | "settlement" | "rebalance" | "transfer";

export interface ActivityItem {
  day: string;
  type: ActivityType;
  icon: string;
  iconTone: "mint" | "violet" | "neutral";
  title: string;
  subtitle: string;
  value: string;
  valueTone?: "mint";
  time: string;
}

const SNOWTRACE_API = "https://api-testnet.snowtrace.io/api";
/** Optional — Snowtrace's free tier works without a key. */
const API_KEY = (import.meta.env["VITE_SNOWTRACE_API_KEY"] as string | undefined) ?? "";

/**
 * Non-transfer activity (fees, settlements, rebalances) isn't an on-chain
 * event this app can read, so those entries stay illustrative.
 */
export function getProtocolActivity(): ActivityItem[] {
  return [
    {
      day: "This week",
      type: "fees",
      icon: "↑",
      iconTone: "mint",
      title: "Fees harvested",
      subtitle: "Bitcoin / Dollar · auto-compounded",
      value: "+$1,240",
      valueTone: "mint",
      time: "Today · 2h ago",
    },
    {
      day: "This week",
      type: "rebalance",
      icon: "⟳",
      iconTone: "violet",
      title: "Gold / Dollar rebalanced",
      subtitle: "Range re-armed · closes Monday",
      value: "—",
      time: "Today · 6h ago",
    },
    {
      day: "This week",
      type: "fees",
      icon: "↑",
      iconTone: "mint",
      title: "Fees harvested",
      subtitle: "Tesla / Dollar · auto-compounded",
      value: "+$610",
      valueTone: "mint",
      time: "Yesterday",
    },
    {
      day: "Last week",
      type: "settlement",
      icon: "✓",
      iconTone: "mint",
      title: "Weekly settlement",
      subtitle: "All pools · fees compounded, IL covered",
      value: "+$18,420",
      valueTone: "mint",
      time: "Mon Jul 6 · 23:00 UTC",
    },
    {
      day: "Last week",
      type: "rebalance",
      icon: "⟳",
      iconTone: "violet",
      title: "Bitcoin / Dollar rebalanced",
      subtitle: "Range shifted up · price moved",
      value: "—",
      time: "Wed Jul 2",
    },
    {
      day: "Earlier",
      type: "settlement",
      icon: "✓",
      iconTone: "mint",
      title: "Weekly settlement",
      subtitle: "All pools · fees compounded, IL covered",
      value: "+$17,880",
      valueTone: "mint",
      time: "Mon Jun 29 · 23:00 UTC",
    },
  ];
}

export const DAY_ORDER = ["This week", "Last week", "Earlier"] as const;

interface RawTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  isError?: string;
}

function dayBucket(ts: number, now: number): string {
  const days = (now - ts) / 86_400_000;
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  return "Earlier";
}

function relativeTime(ts: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ts) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Today · ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAmount(amount: number, symbol: string): string {
  const digits = amount !== 0 && Math.abs(amount) < 1 ? 4 : 2;
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

async function callSnowtrace(params: Record<string, string>): Promise<RawTx[]> {
  const query = new URLSearchParams({ ...params, ...(API_KEY ? { apikey: API_KEY } : {}) });
  const res = await fetch(`${SNOWTRACE_API}?${query.toString()}`);
  if (!res.ok) throw new Error(`Snowtrace request failed (${res.status})`);
  const json = (await res.json()) as { status: string; message: string; result: unknown };
  if (json.status === "1" && Array.isArray(json.result)) return json.result as RawTx[];
  // "No transactions found" comes back as status 0 with an empty result.
  if (Array.isArray(json.result)) return [];
  throw new Error(typeof json.result === "string" ? json.result : "Snowtrace request failed");
}

function toItem(tx: RawTx, address: string, symbol: string, decimals: number): ActivityItem | null {
  let amount = 0;
  try {
    amount = Number(formatUnits(BigInt(tx.value), decimals));
  } catch {
    return null;
  }
  if (!Number.isFinite(amount) || amount === 0) return null;
  const incoming = tx.to?.toLowerCase() === address.toLowerCase();
  const ts = Number(tx.timeStamp) * 1000;
  const now = Date.now();
  return {
    day: dayBucket(ts, now),
    type: "transfer",
    icon: incoming ? "↓" : "↑",
    iconTone: "neutral",
    title: incoming ? "Received" : "Sent",
    subtitle: incoming
      ? `From ${tx.from.slice(0, 6)}…${tx.from.slice(-4)}`
      : `To ${tx.to.slice(0, 6)}…${tx.to.slice(-4)}`,
    value: `${incoming ? "" : "−"}${formatAmount(amount, symbol)}`,
    time: relativeTime(ts, now),
  };
}

async function fetchWalletActivity(address: string): Promise<ActivityItem[]> {
  const base = { address, page: "1", offset: "25", sort: "desc" };
  const [native, usdc] = await Promise.all([
    callSnowtrace({ module: "account", action: "txlist", startblock: "0", endblock: "99999999", ...base }),
    callSnowtrace({ module: "account", action: "tokentx", contractaddress: FUJI_USDC_ADDRESS, ...base }),
  ]);

  const items = [
    ...native.filter((t) => t.isError !== "1").map((t) => toItem(t, address, "AVAX", 18)),
    ...usdc.map((t) => toItem(t, address, t.tokenSymbol || "USDC", Number(t.tokenDecimal ?? 6))),
  ].filter((i): i is ActivityItem => i !== null);

  return items;
}

export interface UseActivityResult {
  items: ActivityItem[];
  isLoading: boolean;
  isError: boolean;
  isConnected: boolean;
}

/**
 * Real wallet transfers from Snowtrace (Fuji), merged with the illustrative
 * protocol events. Never falls back to mock transfers on failure.
 */
export function useActivity(): UseActivityResult {
  const { address, isConnected } = useAccount();

  const query = useQuery({
    queryKey: ["snowtrace-activity", address],
    queryFn: () => fetchWalletActivity(address as string),
    enabled: Boolean(address) && isConnected,
    staleTime: 60_000,
    retry: 1,
  });

  const transfers = query.data ?? [];
  const items = [...getProtocolActivity(), ...transfers].sort(
    (a, b) => DAY_ORDER.indexOf(a.day as never) - DAY_ORDER.indexOf(b.day as never),
  );

  return {
    items,
    isLoading: Boolean(address) && isConnected && query.isLoading,
    isError: query.isError,
    isConnected: Boolean(address) && isConnected,
  };
}
