"use client";

import { FormEvent, useState } from "react";
import { Card } from "@/components/ui/Card";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { db, SearchTrendResult } from "@/lib/db";

// Mirrors SearchCollectionClient's layout (keyword input → result section),
// but the API isn't connected yet (docs/naver-datalab-search-trend-plan.md)
// so this always shows the "연동 필요" banner and renders mock ratio series
// instead of a live lookup once that's wired up.
export function SearchTrendClient({
  initialKeyword,
  initialResult,
}: {
  initialKeyword: string;
  initialResult: SearchTrendResult | null;
}) {
  const [keywordInput, setKeywordInput] = useState(initialKeyword);
  const [submittedKeyword, setSubmittedKeyword] = useState(initialKeyword);
  const [result, setResult] = useState(initialResult);

  function submit(e: FormEvent) {
    e.preventDefault();
    const keyword = keywordInput.trim();
    setSubmittedKeyword(keyword);
    db.searchTrend.search(keyword).then(setResult);
  }

  const chartData = result
    ? mergeSeriesByPeriod(result.series)
    : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">검색어 트렌드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          네이버 데이터랩 통합 검색어 트렌드 기준, 주제어별 검색 관심도 추이를 비교합니다.
        </p>
      </div>

      <InfoBanner
        title="네이버 데이터랩 API 연동 필요"
        description="클라이언트 아이디·시크릿 발급 전이라 아래 그래프는 화면 구조 검증용 mock 데이터입니다. API 연동 후 실제 검색 관심도로 교체됩니다."
      />

      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label htmlFor="trend-keyword-input" className="text-xs font-medium text-neutral-500">
          키워드
        </label>
        <div className="flex items-center gap-2.5">
          <input
            id="trend-keyword-input"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="예: 마케팅 자동화"
            className="h-10 w-[260px] rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90"
          >
            조회
          </button>
        </div>
      </form>

      <div className="h-px w-full bg-neutral-200" />

      {!result ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700">
            {submittedKeyword ? `"${submittedKeyword}"에 대한 트렌드 데이터가 아직 없습니다.` : "시작하려면 키워드를 입력하세요"}
          </p>
          <p className="text-xs text-neutral-500">API 연동 전까지는 mock으로 등록된 키워드만 조회할 수 있습니다.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-neutral-900">주제어별 검색 관심도 추이</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {result.startDate} ~ {result.endDate} · 구간 내 최댓값을 100으로 한 상대 지수 (절대 검색량 아님)
              </p>
            </div>
          </div>
          <MultiLineChart data={chartData} series={result.series.map((s) => s.groupName)} />
        </Card>
      )}
    </div>
  );
}

function mergeSeriesByPeriod(series: SearchTrendResult["series"]) {
  const periods = Array.from(new Set(series.flatMap((s) => s.data.map((d) => d.period)))).sort();
  return periods.map((period) => {
    const row: Record<string, number | string> = { week: period };
    for (const s of series) {
      const point = s.data.find((d) => d.period === period);
      row[s.groupName] = point?.ratio ?? 0;
    }
    return row;
  });
}
