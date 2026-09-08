"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrafficWeek } from "@/lib/db";
import { useInViewOnce } from "@/lib/useInViewOnce";

export function TrafficTrendChart({ data }: { data: TrafficWeek[] }) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} style={{ height: 220 }}>
      {isVisible && (
        <ResponsiveContainer width="100%" height={220}>
          {/* margin gives the first/last x-axis label room to render — SVG
              clips anything outside its viewBox, so a category tick centered
              near the edge with too little margin has its label silently cut
              off instead of just looking cramped. */}
          <LineChart data={data} margin={{ top: 8, left: 40, right: 40 }}>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} interval={0} />
            <YAxis hide />
            <Tooltip />
            <Legend verticalAlign="bottom" height={32} />
            <Line
              type="monotone"
              dataKey="agentic"
              name="에이전틱 트래픽"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 4.5 }}
            />
            <Line
              type="monotone"
              dataKey="referral"
              name="리퍼럴 트래픽"
              stroke="#8c5cf5"
              strokeWidth={2.5}
              dot={{ r: 4.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
