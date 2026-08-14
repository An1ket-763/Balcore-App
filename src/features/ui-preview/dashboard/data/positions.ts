export interface Position {
  name: string;
  status: "ok" | "rb";
  statusLabel: string;
  band: { left: string; width: string; rebalancing?: boolean };
  markLeft: string;
  low: string;
  high: string;
  midLabel: string;
  midColor: string;
}

// Mock data — replace with real protocol contract reads later.
export function getPositions(): Position[] {
  return [
    {
      name: "Bitcoin / Dollar",
      status: "ok",
      statusLabel: "In range",
      band: { left: "22%", width: "56%" },
      markLeft: "44%",
      low: "$58.5k",
      high: "$69.5k",
      midLabel: "now ~$63.2k",
      midColor: "var(--text-2)",
    },
    {
      name: "Tesla / Dollar",
      status: "ok",
      statusLabel: "In range",
      band: { left: "20%", width: "58%" },
      markLeft: "46%",
      low: "$298",
      high: "$352",
      midLabel: "now ~$322",
      midColor: "var(--text-2)",
    },
    {
      name: "Gold / Dollar",
      status: "rb",
      statusLabel: "Rebalancing",
      band: { left: "30%", width: "44%", rebalancing: true },
      markLeft: "72%",
      low: "$3,180",
      high: "$3,460",
      midLabel: "re-arming · closes Mon",
      midColor: "var(--gold)",
    },
  ];
}
