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
import { SentimentWeek } from "@/lib/db";

export function SentimentChart({ data }: { data: SentimentWeek[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={36}
        />
        <Tooltip formatter={(value) => `${value}%`} />
        <Legend verticalAlign="bottom" height={32} />
        <Bar dataKey="positive" name="우호적" stackId="s" fill="#22c55e" barSize={28} />
        <Bar dataKey="neutral" name="중립" stackId="s" fill="#cbd5e1" barSize={28} />
        <Bar
          dataKey="negative"
          name="비우호적"
          stackId="s"
          fill="#f87171"
          radius={[4, 4, 0, 0]}
          barSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
