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

// Mock data — replace with a real backend activity feed later.
export function getActivity(): ActivityItem[] {
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
      type: "transfer",
      icon: "↓",
      iconTone: "neutral",
      title: "Deposit",
      subtitle: "Added to pools · split across pairs",
      value: "$50,000",
      time: "Thu Jul 3",
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
    {
      day: "Earlier",
      type: "transfer",
      icon: "↑",
      iconTone: "neutral",
      title: "Withdrawal",
      subtitle: "Settled on the weekly cycle",
      value: "−$12,000",
      time: "Mon Jun 29",
    },
  ];
}
