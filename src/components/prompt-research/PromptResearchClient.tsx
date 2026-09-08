"use client";

import { FormEvent, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { Dropdown } from "@/components/ui/Dropdown";
import { RelatedTopicsIntent } from "@/components/prompt-research/RelatedTopicsIntent";
import { RelatedTopicsTable, BrandMentionsTable, SourceDomainsTable } from "@/components/prompt-research/PromptResearchTables";
import { db, PromptResearchResult } from "@/lib/db";

const MARKET_OPTIONS = ["미국 (US)", "한국 (KR)", "전세계"];
const MODEL_OPTIONS = ["전체 모델", "ChatGPT", "Gemini", "Claude", "Perplexity", "Naver AI검색", "Google AI Overview"];

// Matches Figma "Prompt Research Screen (Wireframe)" / "... - Results"
// (node 646:12012 / 646:12033). Topic search is client-driven against a
// small seeded lookup for now — see db.promptResearch.search.
export function PromptResearchClient({
  initialTopic,
  initialResult,
  comingSoon,
}: {
  initialTopic: string;
  initialResult: PromptResearchResult | null;
  /** 실 브랜드(Neodigm)에서는 true — LLM API 연동 전까지는 검색 UI 자체를
   *  숨기고 "준비 중" 안내만 보여준다. "Demo" 브랜드에서는 false로 넘어와
   *  기존 mock 검색 화면이 그대로 보인다. */
  comingSoon: boolean;
}) {
  const [topicInput, setTopicInput] = useState(initialTopic);
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [submittedTopic, setSubmittedTopic] = useState(initialTopic);
  const [result, setResult] = useState(initialResult);

  function submit(e: FormEvent) {
    e.preventDefault();
    const topic = topicInput.trim();
    setSubmittedTopic(topic);
    // Static seed for now — only "마케팅 자동화" resolves. A real
    // /prompt-research call replaces this once the pipeline exists.
    db.promptResearch.search(topic).then(setResult);
  }

  if (comingSoon) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">프롬프트 리서치</h1>
          <p className="mt-1 text-sm text-neutral-500">
            사람들이 AI에게 이 토픽에 대해 묻는 질문을 찾고, AI 답변 내 가시성을 높일 수 있는 공백을 발견하세요.
          </p>
        </div>
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700">이 기능은 준비 중입니다</p>
          <p className="text-xs text-neutral-500">
            LLM API 연동 후 실제 토픽 리서치 결과를 제공할 예정입니다.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">프롬프트 리서치</h1>
        <p className="mt-1 text-sm text-neutral-500">
          사람들이 AI에게 이 토픽에 대해 묻는 질문을 찾고, AI 답변 내 가시성을 높일 수 있는 공백을 발견하세요.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label htmlFor="topic-input" className="text-xs font-medium text-neutral-500">
          토픽
        </label>
        <div className="flex items-center gap-2.5">
          <input
            id="topic-input"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="예: 마케팅 자동화"
            className="h-10 w-[260px] rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
          />
          <Dropdown variant="solid" label="마켓" value={market} options={MARKET_OPTIONS} onChange={setMarket} />
          <Dropdown variant="solid" label="모델" value={model} options={MODEL_OPTIONS} onChange={setModel} />
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
            {submittedTopic ? `"${submittedTopic}"에 대한 데이터가 아직 없습니다.` : "시작하려면 토픽을 입력하세요"}
          </p>
          <p className="text-xs text-neutral-500">Enter를 누르거나 검색 버튼을 클릭해 리서치를 시작하세요.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SimpleStatCard
              label="고유 토픽 수"
              value={result.stats.uniqueTopics}
              tooltip="선택한 토픽에 대해 우리가 실행한 프롬프트 응답을 집계한 값입니다."
            />
            <SimpleStatCard
              label="고유 프롬프트 수"
              value={result.stats.uniquePrompts}
              tooltip="선택한 토픽에 대해 우리가 실행한 프롬프트 응답을 집계한 값입니다."
            />
            <SimpleStatCard
              label="고유 브랜드 수"
              value={result.stats.uniqueBrands}
              tooltip="선택한 토픽에 대해 우리가 실행한 프롬프트 응답을 집계한 값입니다."
            />
            <SimpleStatCard
              label="고유 소스 도메인 수"
              value={result.stats.uniqueSourceDomains}
              tooltip="선택한 토픽에 대해 우리가 실행한 프롬프트 응답을 집계한 값입니다."
            />
          </div>

          <RelatedTopicsIntent intent={result.intent} />
          <RelatedTopicsTable rows={result.relatedTopics} />
          <BrandMentionsTable rows={result.brands} />
          <SourceDomainsTable rows={result.sourceDomains} />
        </>
      )}
    </div>
  );
}
