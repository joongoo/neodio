"use client";

import { FormEvent, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { Dropdown } from "@/components/ui/Dropdown";
import { RelatedTopicsIntent } from "@/components/prompt-research/RelatedTopicsIntent";
import { RelatedTopicsTable } from "@/components/prompt-research/PromptResearchTables";
import type { GeneratedPromptResearch } from "@/lib/promptResearch";

const MARKET_OPTIONS = ["한국 (KR)", "미국 (US)", "전세계"];

function formatGeneratedAt(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
}

// 실제 브랜드의 프롬프트 리서치 — 토픽을 검색하면 AI가 관련 토픽과 사람들이 물어볼 질문을 제안한다.
// 같은 토픽은 저장된 결과를 다시 보여 주고, "다시 생성"을 눌렀을 때만 새로 만든다(페이지를 열 때는 호출하지 않는다).
export function LivePromptResearch() {
  const [topicInput, setTopicInput] = useState("");
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [result, setResult] = useState<GeneratedPromptResearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(refresh: boolean) {
    const topic = (refresh ? result?.topic : topicInput)?.trim();
    if (!topic) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prompt-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, market, refresh }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "리서치를 가져오지 못했습니다.");
        return;
      }
      setResult(body.result);
    } catch {
      setError("리서치를 가져오지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void search(false);
  }

  const promptTotal = result?.relatedTopics.reduce((sum, t) => sum + t.promptCount, 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">프롬프트 리서치</h1>
        <p className="mt-1 text-sm text-neutral-500">
          사람들이 AI에게 이 토픽에 대해 묻는 질문을 찾고, AI 답변 내 가시성을 높일 수 있는 공백을 발견하세요.
        </p>
      </div>

      <EditOnly
        fallback={
          <Card className="text-sm text-neutral-600">읽기 전용 권한에서는 새 프롬프트 리서치를 실행할 수 없어요. 리서치가 필요하면 조직 오너나 admin에게 요청하세요.</Card>
        }
      >
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <label htmlFor="topic-input" className="text-xs font-medium text-neutral-500">
          토픽
        </label>
        <div className="flex items-center gap-2.5">
          <input
            id="topic-input"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            maxLength={80}
            placeholder="예: 마케팅 자동화"
            className="h-10 w-[260px] rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
          />
          <Dropdown variant="solid" label="마켓" value={market} options={MARKET_OPTIONS} onChange={setMarket} />
          <button
            type="submit"
            disabled={loading || !topicInput.trim()}
            className="flex h-10 items-center gap-1.5 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "리서치하는 중..." : "검색"}
          </button>
        </div>
      </form>
      </EditOnly>

      <div className="h-px w-full bg-neutral-200" />

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      {!result ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700">{loading ? "AI가 관련 토픽과 질문을 찾는 중입니다…" : "시작하려면 토픽을 입력하세요"}</p>
          <p className="text-xs text-neutral-500">Enter를 누르거나 검색 버튼을 클릭해 리서치를 시작하세요.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              &quot;{result.topic}&quot; · AI가 제안한 관련 토픽과 질문{formatGeneratedAt(result.generatedAt) && ` · ${formatGeneratedAt(result.generatedAt)} 생성`}
            </p>
            <EditOnly>
              <button
                type="button"
                onClick={() => void search(true)}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer hover:bg-slate-200 disabled:cursor-default disabled:opacity-60"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                다시 생성
              </button>
            </EditOnly>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SimpleStatCard label="관련 토픽 수" value={result.relatedTopics.length} tooltip="AI가 이 토픽과 관련 있다고 제안한 하위 토픽의 수입니다." />
            <SimpleStatCard label="제안된 질문 수" value={promptTotal} tooltip="관련 토픽마다 AI가 제안한 질문의 합계입니다." />
          </div>
          <RelatedTopicsIntent intent={result.intent} />
          <RelatedTopicsTable rows={result.relatedTopics} compact description={`${result.topic}와 관련해 AI가 제안한 토픽입니다. 행을 펼치면 제안된 질문을 볼 수 있습니다.`} />
        </>
      )}
    </div>
  );
}
