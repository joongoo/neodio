"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RankedRow } from "@/lib/db";

// isAnimationActive={false} on every shape below: recharts' grow-in
// animation (via react-smooth) can get stuck mid-transition under React 19
// and never paint the final bar — disabling it renders the final state
// immediately, which also means no dead time before the chart is visible.
export function RankedBarChart({ data }: { data: RankedRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40 }}>
        <CartesianGrid horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={110}
        />
        <Tooltip formatter={(_value, _name, item) => item.payload.display} />
        <Bar dataKey="value" fill="#1e293b" radius={[0, 3, 3, 0]} barSize={16} isAnimationActive={false}>
          <LabelList dataKey="display" position="right" fontSize={11} fill="#737373" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
