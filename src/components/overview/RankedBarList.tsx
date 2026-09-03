"use client";

import { useState } from "react";
import { Tabs, TabItem } from "@/components/ui/Tabs";
import { RankedBarChart } from "@/components/charts/RankedBarChart";

export interface RankedBarRow {
  label: string;
  value: number;
  display: string;
}

interface RankedBarListProps {
  panelTitle: string;
  listTitle: string;
  tabs: TabItem[];
  data: Record<string, RankedBarRow[]>;
}

// Matches Figma "Mentions by Model" / "Mentions by Market" (node 646:11620 /
// 646:11657): an underline-tab switcher over a horizontal ranked bar chart.
// The chart itself is recharts (see charts/RankedBarChart) so it gets the
// same hover-tooltip interaction as every other chart in the app.
export function RankedBarList({ panelTitle, listTitle, tabs, data }: RankedBarListProps) {
  const [tab, setTab] = useState(tabs[0]?.id ?? "");
  const rows = data[tab] ?? [];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="sr-only">{panelTitle}</h3>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <p className="mt-4 text-sm font-semibold text-neutral-900">{listTitle}</p>
      <div className="mt-3">
        <RankedBarChart data={rows} />
      </div>
    </div>
  );
}
