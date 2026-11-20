"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CitationOverview } from "@/lib/citationMetrics";

export function CitationTrendChart({ trend, showExposure = false }: { trend: CitationOverview["trend"]; showExposure?: boolean }) {
  if (trend.every(point => point.measured === 0 && (!showExposure || point.exposureMeasured === 0))) return <div className="grid h-[280px] place-items-center rounded-lg bg-neutral-50 text-sm text-neutral-500">기간 내 측정 가능한 답변이 없습니다.</div>;
  const data = trend.map(point => ({ day: point.day.slice(5), youtube: point.youtubeRate === null ? null : Math.round(point.youtubeRate * 1000) / 10,
    own: point.ownRate === null ? null : Math.round(point.ownRate * 1000) / 10,
    exposure: point.exposureRate === null ? null : Math.round(point.exposureRate * 1000) / 10 }));
  return <div className="h-[280px]" role="img" aria-label={`${showExposure ? "AIO 노출률, " : ""}일별 YouTube 및 우리 채널 인용률. 상세 수치는 아래 일별 데이터에서 확인할 수 있습니다.`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
      <CartesianGrid vertical={false} stroke="#f1f5f9" />
      <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
      <YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} fontSize={12} width={45} tickLine={false} axisLine={false} />
      <Tooltip formatter={(value, name) => [value == null ? "–" : `${value}%`, name]} /><Legend verticalAlign="bottom" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
      {showExposure && <Line dataKey="exposure" name="AIO 노출률" stroke="#1e293b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />}
      <Line dataKey="youtube" name="YouTube 인용률" stroke="#fa7317" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
      <Line dataKey="own" name="우리 채널 인용률" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
    </LineChart></ResponsiveContainer>
  </div>;
}
