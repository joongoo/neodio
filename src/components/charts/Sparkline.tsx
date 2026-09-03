"use client";

import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";
import { SparklinePoint } from "@/lib/db";

export function Sparkline({ data }: { data: SparklinePoint[] }) {
  return (
    <ResponsiveContainer width={44} height={20}>
      <BarChart key={data.length} data={data} barCategoryGap="20%">
        <Bar dataKey="value" radius={[1, 1, 0, 0]} isAnimationActive={false}>
          {data.map((point, i) => (
            <Cell key={point.week} fill={i === data.length - 1 ? "#1e293b" : "#e2e8f0"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
