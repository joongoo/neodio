"use client";

import { useState } from "react";
import { Tabs, TabItem } from "@/components/ui/Tabs";

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
// 646:11657): an underline-tab switcher over a horizontal ranked bar list.
export function RankedBarList({ panelTitle, listTitle, tabs, data }: RankedBarListProps) {
  const [tab, setTab] = useState(tabs[0]?.id ?? "");
  const rows = data[tab] ?? [];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="sr-only">{panelTitle}</h3>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <p className="mt-4 text-sm font-semibold text-neutral-900">{listTitle}</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-neutral-700">{row.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
              <div
                className="h-full rounded bg-slate-800"
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs text-neutral-500">{row.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
