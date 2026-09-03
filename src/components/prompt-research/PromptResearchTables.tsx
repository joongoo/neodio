"use client";

import { useMemo, useState } from "react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { TablePanel } from "@/components/ui/TablePanel";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { RelevancyChip } from "@/components/ui/RelevancyChip";
import { TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { BrandMentionRow, RelatedTopicRow, RelatedTopicSubPrompt, SourceDomainRow } from "@/lib/db";

// Matches Figma "Table Row / Related Topic", "Table Row / Brand Mentions",
// "Table Row / Source Domain" (Prompt Research results, node 646:12102 /
// 646:12126 / 646:12152 families).

function buildTopicColumns(
  trackedIds: Set<string>,
  onTrack: (row: RelatedTopicRow) => void
): DataTableColumn<RelatedTopicRow>[] {
  return [
    { key: "topic", label: "토픽", width: "w-[260px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
    { key: "promptCount", label: "프롬프트 수", width: "w-[140px]", render: (r) => r.promptCount },
    { key: "relevancy", label: "관련도", width: "w-[140px]", render: (r) => <RelevancyChip value={r.relevancy} /> },
    {
      key: "action",
      label: "",
      width: "w-[100px]",
      render: (r) =>
        trackedIds.has(r.id) ? (
          <span className="text-[11px] font-medium text-emerald-600">추적 중</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTrack(r);
            }}
            className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer"
          >
            추적
          </button>
        ),
    },
  ];
}
const topicOptional: ColumnOption[] = [
  { key: "promptCount", label: "프롬프트 수" },
  { key: "relevancy", label: "관련도" },
];

const brandColumns: DataTableColumn<BrandMentionRow>[] = [
  {
    key: "brand",
    label: "브랜드",
    width: "w-[220px]",
    render: (r) => (
      <span className="flex items-center gap-2 text-neutral-700">
        <span className="size-4 shrink-0 rounded bg-slate-400" aria-hidden />
        {r.brand}
      </span>
    ),
  },
  { key: "mentions", label: "언급 수", width: "w-[110px]", render: (r) => r.mentions },
  { key: "sourceDomains", label: "소스 도메인 수", width: "w-[130px]", render: (r) => r.sourceDomains },
  {
    key: "examplePrompt",
    label: "프롬프트 예시",
    render: (r) => <span className="truncate text-neutral-500">{r.examplePrompt}</span>,
  },
];
const brandOptional: ColumnOption[] = [
  { key: "mentions", label: "언급 수" },
  { key: "sourceDomains", label: "소스 도메인 수" },
  { key: "examplePrompt", label: "프롬프트 예시" },
];

const sourceColumns: DataTableColumn<SourceDomainRow>[] = [
  {
    key: "domain",
    label: "소스 도메인",
    width: "w-[200px]",
    render: (r) => (
      <span className="flex items-center gap-2 text-neutral-700">
        <span className="size-4 shrink-0 rounded-full bg-slate-400" aria-hidden />
        {r.domain}
      </span>
    ),
  },
  { key: "mentions", label: "언급 수", width: "w-[110px]", render: (r) => r.mentions },
  { key: "sourceUrls", label: "소스 URL 수", width: "w-[110px]", render: (r) => r.sourceUrls },
  {
    key: "examplePrompt",
    label: "프롬프트 예시",
    render: (r) => <span className="truncate text-neutral-500">{r.examplePrompt}</span>,
  },
];
const sourceOptional: ColumnOption[] = [
  { key: "mentions", label: "언급 수" },
  { key: "sourceUrls", label: "소스 URL 수" },
  { key: "examplePrompt", label: "프롬프트 예시" },
];

export function RelatedTopicsTable({ rows }: { rows: RelatedTopicRow[] }) {
  const [trackedTopicIds, setTrackedTopicIds] = useState<Set<string>>(new Set());
  const [trackedPromptIds, setTrackedPromptIds] = useState<Set<string>>(new Set());
  const [trackingTopic, setTrackingTopic] = useState<RelatedTopicRow | null>(null);
  const [trackingPrompt, setTrackingPrompt] = useState<RelatedTopicSubPrompt | null>(null);

  const topicColumns = useMemo(
    () => buildTopicColumns(trackedTopicIds, (row) => setTrackingTopic(row)),
    [trackedTopicIds]
  );
  const { filtered, visible, open, setOpen, setVisible } = useColumnVisibility(topicColumns, topicOptional);

  return (
    <TablePanel title="관련 토픽" description="마케팅 자동화와 관련된 모든 토픽입니다." count={0} total={rows.length} onConfigureColumns={() => setOpen(true)}>
      <DataTable
        columns={filtered}
        rows={rows}
        getRowId={(r) => r.id}
        renderExpanded={(row) =>
          row.subPrompts.length === 0 ? (
            <p className="text-xs text-neutral-400">아직 생성된 하위 프롬프트가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3 border-b border-neutral-100 pb-2 text-xs font-bold text-neutral-500">
                <span className="w-[280px]">프롬프트</span>
                <span className="w-[100px]">모델</span>
                <span className="w-[100px]">브랜드</span>
                <span className="w-[80px]">소스</span>
                <span className="w-[80px]">액션</span>
              </div>
              {row.subPrompts.map((sp) => (
                <div key={sp.id} className="flex items-center gap-3 text-xs text-neutral-700">
                  <span className="w-[280px] truncate" title={sp.aiResponseSummary}>
                    {sp.prompt}
                  </span>
                  <span className="w-[100px]">{sp.model}</span>
                  <span className="w-[100px]">{sp.brandsMentioned}</span>
                  <span className="w-[80px]">{sp.sourcesCited}</span>
                  <span className="w-[80px]">
                    {trackedPromptIds.has(sp.id) ? (
                      <span className="text-[11px] font-medium text-emerald-600">추적 중</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTrackingPrompt(sp)}
                        className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer"
                      >
                        추적
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )
        }
      />
      <ConfigureColumnsModal open={open} onClose={() => setOpen(false)} columns={topicOptional} visible={visible} onApply={setVisible} />

      <TrackTopicModal
        topic={trackingTopic}
        onClose={() => setTrackingTopic(null)}
        onTrack={(id) => setTrackedTopicIds((prev) => new Set(prev).add(id))}
      />
      <TrackTopicModal
        topic={trackingPrompt ? { id: trackingPrompt.id, topic: trackingPrompt.prompt } : null}
        onClose={() => setTrackingPrompt(null)}
        onTrack={(id) => setTrackedPromptIds((prev) => new Set(prev).add(id))}
      />
    </TablePanel>
  );
}

export function BrandMentionsTable({ rows }: { rows: BrandMentionRow[] }) {
  const { filtered, visible, open, setOpen, setVisible } = useColumnVisibility(brandColumns, brandOptional);
  return (
    <TablePanel
      title="브랜드"
      description="관련 토픽에 속한 프롬프트 응답에서 언급된 브랜드 집계 목록입니다."
      count={0}
      total={rows.length}
      onConfigureColumns={() => setOpen(true)}
    >
      <DataTable columns={filtered} rows={rows} getRowId={(r) => r.id} />
      <ConfigureColumnsModal open={open} onClose={() => setOpen(false)} columns={brandOptional} visible={visible} onApply={setVisible} />
    </TablePanel>
  );
}

export function SourceDomainsTable({ rows }: { rows: SourceDomainRow[] }) {
  const { filtered, visible, open, setOpen, setVisible } = useColumnVisibility(sourceColumns, sourceOptional);
  return (
    <TablePanel
      title="소스 도메인"
      description="관련 토픽에 속한 프롬프트 응답에서 인용된 도메인 집계 목록입니다."
      count={0}
      total={rows.length}
      onConfigureColumns={() => setOpen(true)}
    >
      <DataTable columns={filtered} rows={rows} getRowId={(r) => r.id} />
      <ConfigureColumnsModal open={open} onClose={() => setOpen(false)} columns={sourceOptional} visible={visible} onApply={setVisible} />
    </TablePanel>
  );
}
