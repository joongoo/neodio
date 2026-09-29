"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { BrandMentionWeek } from "@/lib/backend/collectionStatsReader";
import { bestLagCorrelation, fillPeriods, MIN_CORRELATION_POINTS, TrendResult } from "@/lib/searchTrend";
import { fetchTrend, TrendGroupInput, TrendQuery } from "./trendApi";
import { SearchVsMentionChart, ShareGapChart } from "./TrendCharts";

const MIN_WEEKS = 26;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weeklyRange(mentionWeeks: BrandMentionWeek[] | null) {
  const end = new Date();
  const first = mentionWeeks?.[0]?.weekStart;
  const start = new Date(Math.min(end.getTime() - MIN_WEEKS * WEEK_MS, first ? new Date(first).getTime() - 8 * WEEK_MS : Infinity));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

// 네이버 검색 관심도(주 단위)와 우리가 수집한 LLM 답변의 브랜드 언급을 같은 주 축에 겹쳐 본다.
// 주제어 이름이 등록된 브랜드 이름과 같을 때만 그 브랜드의 언급과 짝지어진다.
export function TrendLlmCrossTab({ groups, mentionWeeks, base }: { groups: TrendGroupInput[]; mentionWeeks: BrandMentionWeek[] | null; base: Pick<TrendQuery, "device" | "gender" | "ages"> }) {
  const [loaded, setLoaded] = useState<{ key: string; result?: TrendResult; error?: string } | null>(null);
  const [groupName, setGroupName] = useState(groups[0]?.groupName ?? "");

  // 조건이 바뀌면 key가 달라져 이전 응답은 자동으로 "로딩 중"으로 취급된다(effect에서 동기 setState 없음).
  const requestKey = JSON.stringify([groups, base.device, base.gender, base.ages, mentionWeeks?.[0]?.weekStart]);
  useEffect(() => {
    let cancelled = false;
    fetchTrend({ ...base, ...weeklyRange(mentionWeeks), timeUnit: "week", keywordGroups: groups }).then((res) => {
      if (cancelled) return;
      setLoaded(res.ok ? { key: requestKey, result: fillPeriods(res.result) } : { key: requestKey, error: res.error });
    });
    return () => {
      cancelled = true;
    };
    // requestKey가 groups/base/mentionWeeks의 값 비교를 대신한다(부모가 렌더마다 새 객체를 만들 수 있어서).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const current = loaded?.key === requestKey ? loaded : null;

  const analysis = useMemo(() => {
    if (!current?.result || !mentionWeeks?.length) return null;
    const result = current.result;
    const byWeek = new Map(mentionWeeks.map((w) => [w.weekStart, w]));
    const first = mentionWeeks[0].weekStart;
    const last = mentionWeeks[mentionWeeks.length - 1].weekStart;
    const inRange = (period: string) => period >= first && period <= last;
    const mentionSum = (name: string) => mentionWeeks.reduce((sum, w) => sum + (w.mentions[name] ?? 0), 0);

    const matched = result.series.filter((s) => mentionWeeks.some((w) => w.mentions[s.groupName] !== undefined));
    const selected = result.series.find((s) => s.groupName === groupName) ?? result.series[0];
    const selectedMatched = !!selected && matched.includes(selected);

    const rows = selected.data.map((d) => ({
      period: d.period,
      "검색 관심도": d.ratio,
      "AI 언급 수": inRange(d.period) ? (byWeek.get(d.period)?.mentions[selected.groupName] ?? 0) : (null as unknown as number),
    }));
    const overlap = rows.filter((r) => inRange(String(r.period)));
    const correlation = selectedMatched ? bestLagCorrelation(overlap.map((r) => Number(r["검색 관심도"])), overlap.map((r) => Number(r["AI 언급 수"]))) : null;

    // 검색 점유율은 AI 데이터가 있는 기간만 잘라 합산 — 같은 요청 안이라 그룹끼리 비교가 유효하다.
    let gap: { name: string; search: number; ai: number }[] = [];
    if (matched.length >= 2) {
      const searchTotals = matched.map((s) => s.data.filter((d) => inRange(d.period)).reduce((sum, d) => sum + d.ratio, 0));
      const aiTotals = matched.map((s) => mentionSum(s.groupName));
      const sSum = searchTotals.reduce((a, b) => a + b, 0);
      const aSum = aiTotals.reduce((a, b) => a + b, 0);
      if (sSum > 0 && aSum > 0) {
        gap = matched.map((s, i) => ({ name: s.groupName, search: Math.round((searchTotals[i] / sSum) * 1000) / 10, ai: Math.round((aiTotals[i] / aSum) * 1000) / 10 }));
      }
    }
    return { rows, overlapWeeks: overlap.length, correlation, selectedMatched, gap, first, last, totalRuns: mentionWeeks.reduce((s, w) => s + w.runs, 0) };
  }, [current, mentionWeeks, groupName]);

  if (!mentionWeeks?.length) {
    return <Card className="py-14 text-center text-sm text-neutral-500">아직 수집된 AI 답변 데이터가 없어 교차 분석을 할 수 없습니다. 수집 로그에서 답변을 수집하면 여기에 겹쳐 표시됩니다.</Card>;
  }
  if (!current) return <Card className="py-14 text-center text-sm text-neutral-500">주 단위 검색 추이를 불러오는 중…</Card>;
  if (current.error) return <Card className="text-sm text-red-600">{current.error}</Card>;
  if (!analysis) return null;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-sm font-bold text-neutral-900">검색 관심도 × AI 답변 언급</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              선: 네이버 검색 관심도(상대 지수, 왼쪽 축) · 막대: 수집된 AI 답변에서 브랜드가 언급된 횟수(오른쪽 축) · AI 데이터 {analysis.first} ~ {analysis.last}, 수집 {analysis.totalRuns}건
            </p>
          </div>
          <select
            aria-label="주제어"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="ml-auto h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-800"
          >
            {groups.map((g) => (
              <option key={g.groupName}>{g.groupName}</option>
            ))}
          </select>
        </div>
        {analysis.selectedMatched ? (
          <SearchVsMentionChart data={analysis.rows} searchKey="검색 관심도" mentionKey="AI 언급 수" />
        ) : (
          <p className="py-8 text-center text-sm text-neutral-500">
            &quot;{groupName}&quot;은(는) 브랜드 관리에 등록된 브랜드 이름과 달라 AI 언급과 짝지을 수 없습니다. 주제어 이름을 브랜드 이름과 같게 입력하세요.
          </p>
        )}
        {analysis.selectedMatched && (
          <p className="text-xs text-neutral-600">
            {analysis.correlation
              ? `겹치는 ${analysis.correlation.n}주 기준 상관계수 ${analysis.correlation.r} — ${
                  analysis.correlation.lag === 0 ? "같은 주에 함께 움직입니다" : analysis.correlation.lag > 0 ? `검색이 ${analysis.correlation.lag}주 먼저 움직이고 AI 언급이 뒤따릅니다` : `AI 언급이 ${-analysis.correlation.lag}주 먼저 움직이고 검색이 뒤따릅니다`
                }. 상관은 인과가 아닙니다.`
              : `겹치는 기간이 ${analysis.overlapWeeks}주라 상관·선후 관계는 계산하지 않았습니다(${MIN_CORRELATION_POINTS}주 이상 필요).`}
          </p>
        )}
      </Card>

      {analysis.gap.length >= 2 && (
        <Card className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-bold text-neutral-900">검색 점유 vs AI 언급 점유</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              브랜드끼리 비교했을 때 검색에서 차지하는 비중과 AI 답변에서 차지하는 비중입니다. 검색 점유보다 AI 점유가 낮은 브랜드는 수요에 비해 AI에서 덜 노출되는 기회 영역입니다.
            </p>
          </div>
          <ShareGapChart data={analysis.gap} />
          <ul className="flex flex-col gap-1 text-xs text-neutral-700">
            {analysis.gap.map((g) => {
              const diff = Math.round((g.ai - g.search) * 10) / 10;
              return (
                <li key={g.name}>
                  <span className="font-semibold">{g.name}</span> — 검색 {g.search}% · AI {g.ai}% ({diff === 0 ? "격차 없음" : diff > 0 ? `AI가 ${diff}%p 더 노출` : `AI 노출이 ${-diff}%p 부족`})
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
