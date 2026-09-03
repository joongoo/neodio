"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#1e293b", "#3b82f6", "#fa7317", "#22c55e", "#a855f7", "#e02699"];

// Generic weekly multi-series line chart — one <Line> per key in `series`,
// reading its value off each row by that key. Used for Brand Presence's
// "Mentions by Model" market-tracking pair and reusable anywhere else a
// dashboard needs a per-brand/per-series weekly trend line.
export function MultiLineChart({
  data,
  series,
}: {
  data: Record<string, number | string>[];
  series: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
        <Tooltip />
        <Legend verticalAlign="bottom" height={32} />
        {series.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
