"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { Tabs } from "@/components/ui/Tabs";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { NaverSearchResultsTable, GoogleSearchResultsTable } from "@/components/search-collection/SearchCollectionTables";
import { db, SearchCollectionResult } from "@/lib/db";

const ENGINE_TABS = [
  { id: "all", label: "전체" },
  { id: "naver", label: "네이버" },
  { id: "google", label: "구글" },
];

// Mirrors PromptResearchClient's layout (input → stat cards → result
// sections), but the surface is traditional ranked SERP data rather than AI
// answers — see project_naver_p0 memory for why the two are kept separate.
export function SearchCollectionClient({
  initialKeyword,
  initialResult,
}: {
  initialKeyword: string;
  initialResult: SearchCollectionResult | null;
}) {
  const [keywordInput, setKeywordInput] = useState(initialKeyword);
  const [submittedKeyword, setSubmittedKeyword] = useState(initialKeyword);
  const [result, setResult] = useState(initialResult);
  const [engine, setEngine] = useState("all");
  const router = useRouter();

  function submit(e: FormEvent) {
    e.preventDefault();
    const keyword = keywordInput.trim();
    setSubmittedKeyword(keyword);
    db.searchCollection.search(keyword).then(setResult);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">검색결과 리서치</h1>
        <p className="mt-1 text-sm text-neutral-500">
          키워드를 입력하면 네이버·구글에서 실제로 수집된 검색결과를 랭킹 그대로 보여줍니다.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label htmlFor="keyword-input" className="text-xs font-medium text-neutral-500">
          키워드
        </label>
        <div className="flex items-center gap-2.5">
          <input
            id="keyword-input"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="예: 마케팅 자동화"
            className="h-10 w-[260px] rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90"
          >
            검색
          </button>
        </div>
      </form>

      <div className="h-px w-full bg-neutral-200" />

      {!result ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700">
            {submittedKeyword ? `"${submittedKeyword}"에 대한 데이터가 아직 없습니다.` : "시작하려면 키워드를 입력하세요"}
          </p>
          <p className="text-xs text-neutral-500">Enter를 누르거나 검색 버튼을 클릭해 수집 결과를 조회하세요.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SimpleStatCard
              label="수집된 블록 수"
              value={result.stats.collectedBlocks}
              tooltip="선택한 키워드에 대해 네이버·구글에서 수집한 노출 블록(랭킹 항목) 수입니다."
            />
            <SimpleStatCard
              label="노출 URL 수"
              value={result.stats.rankedUrls}
              tooltip="랭킹에 포함된 고유 URL 수입니다."
            />
            <SimpleStatCard
              label="우리 브랜드 노출 수"
              value={result.stats.ownBrandRanks}
              tooltip="우리 브랜드가 랭킹에 노출된 블록 수입니다."
            />
            <SimpleStatCard
              label="경쟁사 노출 수"
              value={result.stats.competitorRanks}
              tooltip="경쟁사가 랭킹에 노출된 블록 수입니다."
            />
          </div>

          <Tabs items={ENGINE_TABS} value={engine} onChange={setEngine} />

          {(engine === "all" || engine === "naver") && <NaverSearchResultsTable rows={result.naver} />}
          {(engine === "all" || engine === "google") && <GoogleSearchResultsTable rows={result.google} />}

          <InfoBanner
            title="이 구조화 데이터는 LLM 분석의 입력이 됩니다"
            description="저장된 레코드(키워드·순위·블록 유형·브랜드 매칭 결과)를 그대로 LLM에 전달해 프롬프트 전략 제안과 기회 발굴을 자동 생성할 예정입니다."
            actionLabel="프롬프트 전략에서 확인"
            onAction={() => router.push("/prompt-strategy")}
          />
        </>
      )}
    </div>
  );
}
