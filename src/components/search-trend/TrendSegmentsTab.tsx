"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { AGE_BUCKETS, computeSignals, fillPeriods, momentumLabel, normalizeTo100, TrendResult, TrendSeries, TrendTimeUnit } from "@/lib/searchTrend";
import { fetchTrend, TrendGroupInput, TrendQuery } from "./trendApi";
import { TrendLineChart } from "./TrendCharts";

interface Segment {
  label: string;
  series: TrendSeries;
}
interface Breakdown {
  group: string;
  device: Segment[];
  gender: Segment[];
  age: Segment[];
}

const DEVICES = [
  { label: "PC", value: "pc" as const },
  { label: "모바일", value: "mo" as const },
];
const GENDERS = [
  { label: "남성", value: "m" as const },
  { label: "여성", value: "f" as const },
];
const API_CALLS = DEVICES.length + GENDERS.length + AGE_BUCKETS.length;

// 기기·성별·연령은 API가 필터로만 제공해서 조건마다 따로 조회한다. 요청마다 "자기 최댓값=100"으로
// 다시 맞춰지므로 세그먼트끼리 크기는 비교할 수 없고, 추이의 모양과 피크 시점만 비교한다.
export function TrendSegmentsTab({ base, groups }: { base: Omit<TrendQuery, "keywordGroups" | "device" | "gender" | "ages">; groups: TrendGroupInput[] }) {
  const [groupName, setGroupName] = useState(groups[0]?.groupName ?? "");
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; data?: Breakdown; error?: string }>({ status: "idle" });

  const group = groups.find((g) => g.groupName === groupName) ?? groups[0];

  async function load() {
    if (!group) return;
    setState({ status: "loading" });
    const run = async (extra: Partial<TrendQuery>, label: string): Promise<Segment | string> => {
      const res = await fetchTrend({ ...base, keywordGroups: [group], ...extra });
      if (!res.ok) return res.error;
      const series = res.result.series[0] ?? { groupName: group.groupName, keywords: group.keywords, data: [] };
      return { label, series: { ...series, groupName: label } };
    };
    const results = await Promise.all([
      ...DEVICES.map((d) => run({ device: d.value }, d.label)),
      ...GENDERS.map((g) => run({ gender: g.value }, g.label)),
      ...AGE_BUCKETS.map((a) => run({ ages: [...a.codes] }, a.label)),
    ]);
    const failed = results.find((r): r is string => typeof r === "string");
    if (failed) {
      setState({ status: "error", error: failed });
      return;
    }
    const segs = results as Segment[];
    setState({
      status: "done",
      data: {
        group: group.groupName,
        device: segs.slice(0, DEVICES.length),
        gender: segs.slice(DEVICES.length, DEVICES.length + GENDERS.length),
        age: segs.slice(DEVICES.length + GENDERS.length),
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="segment-group" className="text-xs font-medium text-neutral-500">
            분석할 주제어
          </label>
          <select
            id="segment-group"
            value={group?.groupName ?? ""}
            onChange={(e) => setGroupName(e.target.value)}
            className="h-10 min-w-[180px] rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-800"
          >
            {groups.map((g) => (
              <option key={g.groupName}>{g.groupName}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={state.status === "loading" || !group}
          className="h-10 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:opacity-50"
        >
          {state.status === "loading" ? "불러오는 중…" : "기기·성별·연령 분석"}
        </button>
        <p className="text-xs text-neutral-500">조건마다 따로 조회하므로 API를 {API_CALLS}회 호출합니다(같은 조건은 30분간 캐시).</p>
      </Card>

      {state.status === "error" && <Card className="text-sm text-red-600">{state.error}</Card>}
      {state.status === "idle" && (
        <Card className="py-14 text-center text-sm text-neutral-500">주제어를 고르고 분석을 실행하면 기기·성별·연령별 추이를 보여줍니다.</Card>
      )}

      {state.status === "done" && state.data && (
        <>
          <p className="text-xs text-neutral-500">
            &quot;{state.data.group}&quot; · 각 선은 자기 최댓값을 100으로 맞춘 추이의 모양입니다. 세그먼트끼리 크기는 비교할 수 없습니다.
          </p>
          <SegmentChart title="기기별" segments={state.data.device} timeUnit={base.timeUnit} />
          <SegmentChart title="성별" segments={state.data.gender} timeUnit={base.timeUnit} />
          <SegmentChart title="연령대별" segments={state.data.age} timeUnit={base.timeUnit} />
        </>
      )}
    </div>
  );
}

function SegmentChart({ title, segments, timeUnit }: { title: string; segments: Segment[]; timeUnit: TrendTimeUnit }) {
  const result: TrendResult = fillPeriods({
    startDate: "",
    endDate: "",
    timeUnit,
    series: segments.map((s) => s.series),
  });
  const norm = result.series.map((s) => normalizeTo100(s.data.map((d) => d.ratio)));
  const data = result.series[0]?.data.map((d, i) => ({ period: d.period, ...Object.fromEntries(result.series.map((s, j) => [s.groupName, norm[j][i]])) })) ?? [];
  const signals = computeSignals(result);
  const empty = segments.every((s) => s.series.data.length === 0);

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-bold text-neutral-900">{title} 검색 관심도 추이</p>
      {empty ? (
        <p className="py-8 text-center text-sm text-neutral-500">이 조건으로는 집계된 검색량이 없습니다.</p>
      ) : (
        <>
          <TrendLineChart data={data} series={result.series.map((s) => s.groupName)} height={240} />
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-1.5 font-medium">세그먼트</th>
                <th className="py-1.5 font-medium">피크 구간</th>
                <th className="py-1.5 font-medium">최근 추세</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.groupName} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1.5 font-medium text-neutral-800">{s.groupName}</td>
                  <td className="py-1.5 text-neutral-600">{s.peak.ratio > 0 ? s.peak.period : "—"}</td>
                  <td className="py-1.5 text-neutral-600">
                    {momentumLabel(s.momentum)}
                    {s.changePercent !== null && ` (${s.changePercent > 0 ? "+" : ""}${s.changePercent}%)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
