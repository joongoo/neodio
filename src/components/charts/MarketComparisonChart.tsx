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

export function MarketComparisonChart({ data }: { data: MarketComparisonRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          type="category"
          dataKey="brand"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={72}
        />
        <Tooltip formatter={(value) => Number(value).toLocaleString("ko-KR")} />
        <Legend verticalAlign="bottom" height={32} />
        <Bar dataKey="mentions" name="언급 수" stackId="m" fill="#3b82f6" />
        <Bar dataKey="citations" name="인용 수" stackId="m" fill="#fa7317" />
      </BarChart>
    </ResponsiveContainer>
  );
}
