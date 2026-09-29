"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Copy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { computeSignals, describeSignal, momentumLabel, shareByPeriod, toPromptContext, TrendMomentum, TrendResult } from "@/lib/searchTrend";
import { SERIES_COLORS } from "./trendApi";
import { ShareAreaChart, TrendLineChart } from "./TrendCharts";

const MOMENTUM_STYLE: Record<TrendMomentum, { icon: typeof ArrowUpRight; className: string }> = {
  rising: { icon: ArrowUpRight, className: "text-emerald-600" },
  falling: { icon: ArrowDownRight, className: "text-red-600" },
  stable: { icon: ArrowRight, className: "text-neutral-500" },
  none: { icon: ArrowRight, className: "text-neutral-400" },
};

// 입력은 fillPeriods를 거친 결과(모든 그룹이 같은 구간축).
export function TrendOverviewTab({ result }: { result: TrendResult }) {
  const signals = useMemo(() => computeSignals(result), [result]);
  const lineData = useMemo(
    () => result.series[0]?.data.map((d, i) => ({ period: d.period, ...Object.fromEntries(result.series.map((s) => [s.groupName, s.data[i]?.ratio ?? 0])) })) ?? [],
    [result]
  );
  const shareData = useMemo(() => shareByPeriod(result), [result]);
  const names = result.series.map((s) => s.groupName);
  const promptContext = useMemo(() => toPromptContext(result, signals), [result, signals]);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(signals.length, 3)}, minmax(0, 1fr))` }}>
        {signals.map((s, i) => {
          const { icon: Icon, className } = MOMENTUM_STYLE[s.momentum];
          return (
            <Card key={s.groupName} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                <p className="truncate text-sm font-bold text-neutral-900">{s.groupName}</p>
                <span className={cn("ml-auto flex items-center gap-0.5 text-xs font-semibold", className)}>
                  <Icon size={14} />
                  {momentumLabel(s.momentum)}
                  {s.changePercent !== null && ` ${s.changePercent > 0 ? "+" : ""}${s.changePercent}%`}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="최근 관심도" value={s.latest.toFixed(1)} />
                <Stat label="평균" value={s.average.toFixed(1)} />
                <Stat label="점유율" value={`${Math.round(s.interestShare * 100)}%`} />
                <Stat label="피크" value={s.peak.period || "—"} wide />
                <Stat label="변동성" value={s.volatility.toFixed(2)} />
              </dl>
              <p className="text-[11px] leading-relaxed text-neutral-500">{describeSignal(s, result.timeUnit)}</p>
            </Card>
          );
        })}
      </div>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-bold text-neutral-900">주제어별 검색 관심도 추이</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {result.startDate} ~ {result.endDate} · 같은 조회 안에서 가장 높은 값을 100으로 한 상대 지수입니다. 절대 검색량이 아니며, 검색량이 너무 적은 구간은 0으로 표시됩니다.
          </p>
        </div>
        <TrendLineChart data={lineData} series={names} />
      </Card>

      {names.length > 1 && (
        <Card className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-bold text-neutral-900">관심도 점유율 변화</p>
            <p className="mt-0.5 text-xs text-neutral-500">구간마다 주제어들의 관심도 합을 100%로 본 비중입니다. 경쟁 구도가 어느 시점에 바뀌었는지 볼 때 씁니다.</p>
          </div>
          <ShareAreaChart data={shareData} series={names} />
        </Card>
      )}

      <Card className="flex flex-col gap-2 bg-neutral-50">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-neutral-900">프롬프트·가시성 참고 요약</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(promptContext).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="ml-auto flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 ring-1 ring-neutral-200 cursor-pointer hover:bg-neutral-100"
          >
            <Copy size={12} />
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="break-words text-xs leading-relaxed text-neutral-700">{promptContext}</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
