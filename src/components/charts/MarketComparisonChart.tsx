"use client";

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

function truncateLabel(label: string) {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

// Long brand names ("Adobe Marketo Engage", "Salesforce Marketing Cloud")
// wrapped onto multiple cramped lines inside recharts' default tick width —
// truncating to one line (with the full name in a native <title> tooltip on
// hover) reads far more clearly than letting the axis wrap text itself.
function BrandTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = payload?.value ?? "";
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#525252">
      <title>{label}</title>
      {truncateLabel(label)}
    </text>
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
              width={100}
              tick={<BrandTick />}
            />
            <Tooltip formatter={(value) => Number(value).toLocaleString("ko-KR")} />
            <Legend verticalAlign="bottom" height={32} />
            <Bar dataKey="mentions" name="언급 수" stackId="m" fill="#3b82f6" />
            <Bar dataKey="citations" name="인용 수" stackId="m" fill="#fa7317" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
