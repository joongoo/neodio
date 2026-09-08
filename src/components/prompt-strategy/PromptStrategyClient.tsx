"use client";

import { useMemo, useState } from "react";
import { Settings } from "lucide-react";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
import { PromptStrategyData, PromptStrategySuggestion, PromptStrategyTopicRow, StrategySource } from "@/lib/db";

const OPTIONAL_COLUMNS: ColumnOption[] = [
  { key: "market", label: "마켓" },
  { key: "gscImpressions", label: "GSC 노출 수" },
  { key: "source", label: "출처" },
  { key: "brandMentions", label: "브랜드별 언급 수" },
];

const SOURCE_LABEL: Record<StrategySource, string> = {
  gsc: "GSC",
  llm_brainstorm: "LLM 브레인스토밍",
};

const TAG_LABEL: Record<PromptStrategySuggestion["tag"], { text: string; className: string }> = {
  coverage_gap: { text: "커버리지 공백", className: "bg-amber-50 text-amber-700" },
  strength: { text: "우위를 점한 토픽", className: "bg-emerald-50 text-emerald-700" },
};

export function PromptStrategyClient({ initial }: { initial: PromptStrategyData }) {
  const topics = initial.topics;
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | StrategySource>("all");
  const [trackingTopic, setTrackingTopic] = useState<PromptStrategyTopicRow | null>(null);

  const tabs = [
    { id: "all", label: "전체", badge: topics.length },
    { id: "gsc", label: "GSC", badge: topics.filter((t) => t.source === "gsc").length },
    { id: "llm_brainstorm", label: "LLM 브레인스토밍", badge: topics.filter((t) => t.source === "llm_brainstorm").length },
  ];

  const filteredTopics = filter === "all" ? topics : topics.filter((t) => t.source === filter);

  const columns: DataTableColumn<PromptStrategyTopicRow>[] = useMemo(
    () => [
      { key: "topic", label: "토픽", width: "w-[240px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
      { key: "market", label: "마켓", width: "w-[70px]", render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span> },
      {
        key: "gscImpressions",
        label: "GSC 노출 수",
        width: "w-[100px]",
        render: (r) => (r.gscImpressions === null ? <span className="text-neutral-300">—</span> : r.gscImpressions.toLocaleString("ko-KR")),
      },
      {
        key: "source",
        label: "출처",
        width: "w-[130px]",
        render: (r) => <span className="text-xs text-neutral-500">{SOURCE_LABEL[r.source]}</span>,
      },
      {
        key: "brandMentions",
        label: "브랜드별 언급 수",
        render: (r) => (
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {[...r.brandMentions]
              .sort((a, b) => (b.isOwnBrand ? 1 : 0) - (a.isOwnBrand ? 1 : 0))
              .map((bm) => (
                <span key={bm.brand} className={bm.isOwnBrand ? "font-bold text-slate-800" : "text-neutral-500"}>
                  {bm.brand} {bm.mentions}
                </span>
              ))}
          </span>
        ),
      },
      {
        key: "action",
        label: "액션",
        width: "w-[90px]",
        render: (r) =>
          trackedIds.has(r.id) ? (
            <span className="text-[11px] font-medium text-emerald-600">추적 중</span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTrackingTopic(r);
              }}
              className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-50"
            >
              추적
            </button>
          ),
      },
    ],
    [trackedIds]
  );

  const { filtered, visible, open, setOpen, setVisible } = useColumnVisibility(columns, OPTIONAL_COLUMNS);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">프롬프트 전략</h1>
        <p className="mt-1 text-sm text-neutral-500">우리 사이트 실측 데이터와 LLM 인사이트를 기반으로 다음에 추적할 토픽을 추천받으세요.</p>
      </div>

      <InfoBanner
        title="프롬프트 전략은 어떻게 동작하나요"
        description="Google Search Console(자사 실측 노출)과 매주 LLM에게 현재 데이터를 기반으로 요청하는 인사이트 브레인스토밍, 두 소스에서 프롬프트를 추천합니다."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {initial.suggestions.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_LABEL[s.tag].className}`}>
                {TAG_LABEL[s.tag].text}
              </span>
              <span className="text-[11px] text-neutral-400">{SOURCE_LABEL[s.source]}</span>
            </div>
            <h3 className="text-sm font-bold text-neutral-900">{s.title}</h3>
            <p className="text-xs text-neutral-500">{s.summary}</p>
            <p className="mt-1 text-[11px] font-medium text-neutral-600">{s.stat}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <Tabs variant="badge" items={tabs} value={filter} onChange={(id) => setFilter(id as typeof filter)} />
          <button
            type="button"
            aria-label="컬럼 설정"
            onClick={() => setOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
        <div className="mt-4">
          <DataTable columns={filtered} rows={filteredTopics} getRowId={(r) => r.id} />
        </div>
        <ConfigureColumnsModal open={open} onClose={() => setOpen(false)} columns={OPTIONAL_COLUMNS} visible={visible} onApply={setVisible} />
      </div>

      <TrackTopicModal
        target={
          trackingTopic
            ? { kind: "topic", id: trackingTopic.id, topic: trackingTopic.topic, market: trackingTopic.market }
            : null
        }
        onClose={() => setTrackingTopic(null)}
        onTrack={(target) => setTrackedIds((prev) => new Set(prev).add(target.id))}
      />
    </div>
  );
}
