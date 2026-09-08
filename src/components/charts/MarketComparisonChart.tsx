"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MarketComparisonRow } from "@/lib/db";
import { useInViewOnce } from "@/lib/useInViewOnce";

const MAX_LABEL_LENGTH = 12;
const LABEL_AREA_WIDTH = 100;

function truncateLabel(label: string) {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

// Long brand names ("Adobe Marketo Engage", "Salesforce Marketing Cloud")
// wrapped onto multiple cramped lines inside recharts' default tick width —
// truncating to one line reads far more clearly than letting the axis wrap
// text itself. Left-aligned to the label column (not right-aligned against
// the axis/bars) so shorter names like "HubSpot" don't look glued to the
// chart. A foreignObject tooltip (not the native <title>, which is too slow
// and inconsistently styled across browsers) shows the full name on hover,
// only for labels that are actually truncated.
function BrandTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const [hovered, setHovered] = useState(false);
  const label = payload?.value ?? "";
  const isTruncated = label.length > MAX_LABEL_LENGTH;
  const leftX = (x ?? 0) - LABEL_AREA_WIDTH + 4;

  return (
    <g>
      <text
        x={leftX}
        y={y}
        dy={4}
        textAnchor="start"
        fontSize={12}
        fill="#525252"
        onMouseEnter={() => isTruncated && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: isTruncated ? "default" : undefined }}
      >
        {truncateLabel(label)}
      </text>
      {hovered && (
        <foreignObject x={leftX} y={(y ?? 0) - 26} width={220} height={22} style={{ overflow: "visible" }}>
          <div
            className="inline-block whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[11px] text-white shadow-lg"
            style={{ pointerEvents: "none" }}
          >
            {label}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export function MarketComparisonChart({ data }: { data: MarketComparisonRow[] }) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} style={{ height: 220 }}>
      {isVisible && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              type="category"
              dataKey="brand"
              tickLine={false}
              axisLine={false}
              width={LABEL_AREA_WIDTH}
              tick={<BrandTick />}
            />
            <Tooltip formatter={(value) => Number(value).toLocaleString("ko-KR")} />
            <Legend verticalAlign="bottom" height={32} />
            <Bar dataKey="mentions" name="언급 수" stackId="m" fill="#3b82f6" barSize={28} />
            <Bar dataKey="citations" name="인용 수" stackId="m" fill="#fa7317" barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
