"use client";

import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useInViewOnce } from "@/lib/useInViewOnce";
import { SERIES_COLORS } from "./trendApi";

type Row = Record<string, number | string>;

const AXIS = { tickLine: false, axisLine: false, fontSize: 12 } as const;

function ChartFrame({ height, children }: { height: number; children: React.ReactElement }) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} style={{ height }}>
      {isVisible && (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}

const round1 = (v: unknown) => (typeof v === "number" ? Math.round(v * 10) / 10 : String(v));

/** 구간별 상대 관심도(0~100) 라인. `data` 각 행은 { period, [series]: number }. */
export function TrendLineChart({ data, series, height = 260, colors = SERIES_COLORS, yMax = 100 }: { data: Row[]; series: string[]; height?: number; colors?: string[]; yMax?: number }) {
  return (
    <ChartFrame height={height}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="period" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={36} domain={[0, yMax]} />
        <Tooltip formatter={round1} />
        <Legend verticalAlign="bottom" height={32} />
        {series.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={data.length <= 40 ? { r: 3 } : false} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

/** 구간별 그룹 점유율(%) 누적 영역 — 같은 요청 안의 그룹끼리만 유효한 상대 비중. */
export function ShareAreaChart({ data, series, height = 260 }: { data: Row[]; series: string[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} stackOffset="expand">
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="period" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={44} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
        <Tooltip formatter={(v) => `${round1(v)}%`} />
        <Legend verticalAlign="bottom" height={32} />
        {series.map((key, i) => (
          <Area key={key} type="monotone" dataKey={key} stackId="share" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.75} />
        ))}
      </AreaChart>
    </ChartFrame>
  );
}

/** 왼쪽 축: 검색 관심도(라인, 0~100) / 오른쪽 축: AI 언급 수(막대). 단위가 다른 두 시계열을 한 화면에서 겹쳐 본다. */
export function SearchVsMentionChart({ data, searchKey, mentionKey, height = 300 }: { data: Row[]; searchKey: string; mentionKey: string; height?: number }) {
  return (
    <ChartFrame height={height}>
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="period" {...AXIS} minTickGap={24} />
        <YAxis yAxisId="left" {...AXIS} width={36} domain={[0, 100]} />
        <YAxis yAxisId="right" orientation="right" {...AXIS} width={36} allowDecimals={false} />
        <Tooltip formatter={round1} />
        <Legend verticalAlign="bottom" height={32} />
        <Bar yAxisId="right" dataKey={mentionKey} fill="#cbd5e1" radius={[3, 3, 0, 0]} />
        <Line yAxisId="left" type="monotone" dataKey={searchKey} stroke="#1e293b" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartFrame>
  );
}

/** 검색 점유율 vs AI 언급 점유율을 브랜드별로 나란히 — 격차가 큰 브랜드가 곧 기회/리스크. */
export function ShareGapChart({ data, height = 260 }: { data: { name: string; search: number; ai: number }[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" {...AXIS} />
        <YAxis {...AXIS} width={40} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip formatter={(v) => `${round1(v)}%`} />
        <Legend verticalAlign="bottom" height={32} />
        <Bar dataKey="search" name="검색 관심도 점유" fill="#1e293b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="ai" name="AI 언급 점유" fill="#fa7317" radius={[3, 3, 0, 0]} />
      </ComposedChart>
    </ChartFrame>
  );
}
