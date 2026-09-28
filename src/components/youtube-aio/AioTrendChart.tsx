"use client";

import { CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useInViewOnce } from "@/lib/useInViewOnce";
import { AioTrendPoint } from "@/lib/db";
import { formatPercent } from "./labels";

// 추이(일/주 단위) — AIO 노출률(맥락, 중립색) · YouTube 인용률 · 채널 인용률(핵심)
// 세 선과 최적화 적용 시점의 세로 기준선. 앱의 기존 차트 색 순서(slate,
// blue, orange — charts/MultiLineChart)를 따른다. 주황은 흰 배경 대비가
// 낮아 범례 + 선 끝 값 라벨로 보완하고, 미측정 구간은 0이 아니라 끊긴 선.
const SERIES = [
  { key: "aioExposure", name: "AIO 노출률", color: "#1e293b", width: 2 },
  { key: "youtubeCitation", name: "YouTube 인용률", color: "#fa7317", width: 2 },
  { key: "ownCitation", name: "채널 인용률", color: "#3b82f6", width: 3 },
] as const;

export function AioTrendChart({
  trend,
  granularity,
  optimizationLabel,
}: {
  trend: AioTrendPoint[];
  granularity: "day" | "week";
  optimizationLabel: string | null;
}) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>();
  const lastIndex = trend.length - 1;
  const data = trend.map((w) => ({
    label: w.label,
    aioExposure: w.aioExposure === null ? null : Math.round(w.aioExposure * 1000) / 10,
    youtubeCitation: w.youtubeCitation === null ? null : Math.round(w.youtubeCitation * 1000) / 10,
    ownCitation: w.ownCitation === null ? null : Math.round(w.ownCitation * 1000) / 10,
  }));

  if (trend.every((w) => w.aioExposure === null)) {
    return (
      <div className="grid h-[280px] place-items-center rounded-lg bg-neutral-50 text-sm text-neutral-500">
        기간 내 수집 기록이 없습니다. 수집이 쌓이면 추이가 표시됩니다.
      </div>
    );
  }

  return (
    <div ref={ref} style={{ height: 280 }}>
      {isVisible && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 20, right: 44, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#737373" }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={40}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "#737373" }}
            />
            <Tooltip
              formatter={(value, name) => [value === null || value === undefined ? "–" : `${value}%`, name]}
              labelFormatter={(label) => (granularity === "week" ? `${label} 주` : `${label}`)}
            />
            <Legend verticalAlign="bottom" height={32} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {optimizationLabel && (
              <ReferenceLine
                x={optimizationLabel}
                stroke="#a3a3a3"
                strokeDasharray="4 4"
                label={{ value: "최적화 적용", position: "top", fontSize: 11, fill: "#525252" }}
              />
            )}
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.width}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={s.key}
                  content={({ x, y, value, index }) =>
                    index === lastIndex && value !== null && value !== undefined ? (
                      <text x={Number(x) + 8} y={Number(y) + 4} fontSize={11} fill="#404040">
                        {formatPercent(Number(value) / 100)}
                      </text>
                    ) : null
                  }
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
