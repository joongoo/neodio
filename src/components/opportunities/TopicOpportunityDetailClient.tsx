"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
import { LlmBridgeModal } from "@/components/ui/LlmBridgeModal";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { TopicRow, TopicVisibilityFunnel } from "@/lib/db";

export function TopicOpportunityDetailClient({ row }: { row: TopicRow }) {
  const router = useRouter();
  const [trackOpen, setTrackOpen] = useState(false);
  const [targetUrlInput, setTargetUrlInput] = useState(row.targetUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [viewingGuide, setViewingGuide] = useState(false);

  async function saveTargetUrl() {
    setSaving(true);
    await fetch("/api/topic-opportunity-target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: row.topic, targetUrl: targetUrlInput.trim() }),
    });
    setSaving(false);
    router.refresh();
  }

  async function trackTopic(category: string) {
    await fetch("/api/tracked-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: row.topic, category, topic: "토픽 기회", source: "기회" }),
    });
    setTrackOpen(false);
    router.refresh();
  }

  const runColumns: DataTableColumn<TopicRow["prompts"][number]>[] = [
    {
      key: "runAt",
      label: "수집 시각",
      width: "w-[140px]",
      render: (p) => (p.runAt ? new Date(p.runAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "—"),
    },
    { key: "model", label: "모델", width: "w-[120px]", render: (p) => p.model },
    { key: "market", label: "마켓", width: "w-[80px]", render: (p) => p.market },
    {
      key: "myBrand",
      label: "우리 브랜드",
      width: "w-[100px]",
      render: (p) => (
        <span className={`text-xs font-bold ${p.myBrand === "노출" ? "text-emerald-600" : "text-neutral-400"}`}>{p.myBrand}</span>
      ),
    },
    { key: "brand", label: "타 브랜드 언급 수", width: "w-[130px]", render: (p) => p.brand },
    { key: "source", label: "인용 수", width: "w-[90px]", render: (p) => p.source },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6 pb-10">
      <a href="/opportunities" className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        기회 목록으로 돌아가기
      </a>

      <div>
        <h1 className="text-[22px] font-bold text-neutral-900">{row.topic}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          GSC/실측 수집에서 발견된 토픽이지만, 지금까지 수집된 실행에서는 아직 우리 브랜드가 언급되지 않았습니다.
        </p>
      </div>

      <div className="flex gap-7 rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <StatPair value={row.mentions} label="언급 수" />
        <StatPair value={row.funnel && row.funnel.totalResponses === 0 ? "–" : `${row.visibility}%`} label="가시성" />
        <StatPair value={row.market} label="마켓" />
        <StatPair value={row.prompts.length} label="수집된 실행 수" />
      </div>

      {row.funnel && <VisibilityFunnel funnel={row.funnel} />}

      <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <h2 className="text-[15px] font-bold text-neutral-900">프롬프트 라이브러리</h2>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-neutral-50 p-4">
          {row.addedToLibrary ? (
            <span className="text-sm font-bold text-emerald-700">이미 프롬프트 라이브러리에 추가돼 있습니다.</span>
          ) : (
            <>
              <span className="text-sm text-neutral-600">아직 프롬프트 라이브러리에 없습니다. 콘텐츠를 만들었다면 추가해두세요.</span>
              <button
                type="button"
                onClick={() => setTrackOpen(true)}
                className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-white cursor-pointer hover:opacity-90"
              >
                라이브러리에 추가
              </button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <h2 className="text-[15px] font-bold text-neutral-900">콘텐츠 인용 트래킹</h2>
        <p className="mt-1 text-xs text-neutral-500">
          이 토픽을 위해 만든 콘텐츠 페이지 URL을 입력하면, 실제 수집된 AI 답변에서 그 URL이 인용된 횟수를 실측으로 보여줍니다.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={targetUrlInput}
            onChange={(e) => setTargetUrlInput(e.target.value)}
            placeholder="https://..."
            className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
          />
          <button
            type="button"
            disabled={saving || !targetUrlInput.trim()}
            onClick={saveTargetUrl}
            className="h-10 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            저장
          </button>
        </div>
        {row.targetUrl && (
          <p className="mt-3 text-sm">
            실측 인용 횟수:{" "}
            <span className={`font-bold ${row.targetUrlCitations ? "text-emerald-700" : "text-neutral-500"}`}>
              {row.targetUrlCitations ?? 0}회
            </span>
            {(row.targetUrlCitations ?? 0) > 0 && " ✅"}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-neutral-400" />
            <h2 className="text-[15px] font-bold text-neutral-700">LLM 기반 콘텐츠 생성 가이드</h2>
          </div>
          <button
            type="button"
            onClick={() => (row.guide ? setViewingGuide(true) : setGuideOpen(true))}
            className={`flex shrink-0 items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
              row.guide ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
            }`}
          >
            <Sparkles size={12} />
            {row.guide ? "가이드 보기" : "가이드 등록"}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          아직 LLM API가 연동되지 않아, "가이드 등록" 버튼으로 직접 LLM에게 물어본 답변을 등록할 수 있습니다. API가 연동되면
          자동으로 채워집니다.
        </p>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <h2 className="text-[15px] font-bold text-neutral-900">수집 로그별 변화</h2>
        <p className="mt-1 text-xs text-neutral-500">
          이 토픽으로 실제 수집된 실행들입니다. 언급/인용 여부가 수집할 때마다 어떻게 바뀌는지 시간순으로 확인하세요.
        </p>
        <div className="mt-3">
          <DataTable columns={runColumns} rows={row.prompts} getRowId={(p) => p.id} />
        </div>
      </section>

      <TrackTopicModal
        target={trackOpen ? { kind: "topic", id: row.id, topic: row.topic, market: row.market } : null}
        onClose={() => setTrackOpen(false)}
        onTrack={(_target, category) => trackTopic(category)}
      />

      {guideOpen && (
        <LlmBridgeModal
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          title="LLM 기반 콘텐츠 생성 가이드 등록"
          instructions="LLM API 연동 전까지, 이 토픽으로 콘텐츠를 만들 때 어떤 내용/형식이 좋을지 LLM에게 직접 물어본 뒤 답변을 붙여넣어 등록합니다."
          scope="topic-guide"
          itemKey={row.topic}
          promptText={`다음은 AI 검색/챗봇에서 자주 등장하지만 아직 우리 브랜드가 언급되지 않는 토픽입니다: "${row.topic}" (마켓: ${row.market})\n\n이 토픽에 대해 우리 브랜드가 언급/인용될 수 있는 콘텐츠를 만들려면 어떤 제목/구성/핵심 내용으로 작성하면 좋을지 구체적인 콘텐츠 생성 가이드를 문단으로 작성해주세요.`}
          parse={(raw) => (raw.trim() ? { data: { guide: raw } } : { error: "내용을 입력해주세요." })}
          onSaved={() => router.refresh()}
        />
      )}

      {viewingGuide && row.guide && (
        <Modal open={viewingGuide} onClose={() => setViewingGuide(false)}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">LLM 기반 콘텐츠 생성 가이드</h2>
            <ModalCloseButton onClose={() => setViewingGuide(false)} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">{row.topic}</p>
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-[13px] leading-relaxed text-neutral-700">{row.guide}</p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setViewingGuide(false);
                setGuideOpen(true);
              }}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
            >
              다시 등록
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatPair({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-bold text-neutral-900">{value}</span>
      <span className="text-[11px] text-neutral-500">{label}</span>
    </div>
  );
}

// 4단계 중첩 퍼널 — "미노출"의 원인이 프롬프트 자체(AI가 답을 잘 안 만듦)
// 인지 콘텐츠(경쟁사는 언급되는데 자사만 빠짐)인지 구간별로 구분해서
// 보여준다. 각 단계는 앞 단계의 부분집합이라 % 표시는 항상 "전체 대비".
function VisibilityFunnel({ funnel }: { funnel: TopicVisibilityFunnel }) {
  const { totalResponses, aiExistResponses, commercialOpportunityResponses, mentionedResponses } = funnel;
  const pct = (n: number) => (totalResponses === 0 ? "–" : `${Math.round((n / totalResponses) * 100)}%`);

  const stages = [
    { label: "전체 실행", value: totalResponses, pct: totalResponses === 0 ? "–" : "100%" },
    { label: "AI 답변 존재", value: aiExistResponses, pct: pct(aiExistResponses) },
    { label: "브랜드 언급 (자사+경쟁사)", value: commercialOpportunityResponses, pct: pct(commercialOpportunityResponses) },
    { label: "자사 언급", value: mentionedResponses, pct: pct(mentionedResponses) },
  ];

  // 가장 크게 줄어든 구간을 찾아 원인별 처방을 다르게 안내한다.
  const drops = [
    { from: 0, to: 1, hint: "AI가 이 질문엔 답변 자체를 잘 안 만듭니다 — 콘텐츠로는 못 고치는 구간입니다. 질문 세트 자체를 재검토해보세요." },
    { from: 1, to: 2, hint: "AI는 답하지만 브랜드 자체가 잘 안 나오는 개념 설명형 질문입니다 — 이 구간도 콘텐츠보다 질문 성격의 문제일 가능성이 높습니다." },
    { from: 2, to: 3, hint: "다른 브랜드는 언급되는데 자사만 빠지고 있습니다 — 콘텐츠 보강이 효과 있을 가능성이 높은 구간입니다." },
  ]
    .map((d) => ({ ...d, size: stages[d.from].value - stages[d.to].value }))
    .filter((d) => stages[d.from].value > 0);
  const biggestDrop = drops.length > 0 ? drops.reduce((a, b) => (b.size > a.size ? b : a)) : null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
      <h2 className="text-[15px] font-bold text-neutral-900">Visibility Funnel</h2>
      <p className="mt-1 text-xs text-neutral-500">
        전체 실행에서 자사 언급까지 어느 단계에서 줄어드는지 봅니다. 봇 차단 등 진짜 수집 실패는 제외한 수치입니다.
      </p>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {stages.map((s, i) => (
          <div key={s.label} className={`rounded-lg p-3 ${i === 0 ? "bg-slate-800 text-white" : "bg-violet-50 text-violet-900"}`}>
            <div className="text-2xl font-bold">{s.pct}</div>
            <div className={`mt-1 text-[11px] ${i === 0 ? "text-slate-300" : "text-violet-600"}`}>{s.label}</div>
            <div className={`mt-0.5 text-[11px] ${i === 0 ? "text-slate-400" : "text-violet-500"}`}>{s.value}건</div>
          </div>
        ))}
      </div>
      {biggestDrop && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-bold">가장 크게 줄어든 구간: </span>
          {stages[biggestDrop.from].label} → {stages[biggestDrop.to].label} ({biggestDrop.size}건 감소). {biggestDrop.hint}
        </p>
      )}
    </section>
  );
}
