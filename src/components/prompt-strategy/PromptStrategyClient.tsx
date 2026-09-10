"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { Search, Users, Quote } from "lucide-react";
import { TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
import { LlmBulkBridgeModal } from "@/components/ui/LlmBulkBridgeModal";
import { BrainstormWizardModal } from "@/components/prompt-strategy/BrainstormWizardModal";
import { PromptStrategyData, PromptStrategySuggestion, PromptStrategyTopicRow, StrategySource } from "@/lib/db";

const SOURCE_LABEL: Record<StrategySource, string> = {
  gsc: "구글서치콘솔",
  llm_brainstorm: "가상 사용자 질문",
  citation_attempt: "인용 테스트",
};

const TAG_LABEL: Record<PromptStrategySuggestion["tag"], { text: string; className: string }> = {
  coverage_gap: { text: "커버리지 공백", className: "bg-amber-50 text-amber-700" },
  strength: { text: "우위를 점한 토픽", className: "bg-emerald-50 text-emerald-700" },
};

export function PromptStrategyClient({
  initial,
  preTrackedIds = [],
  brainstormDigest = "",
  gscKeywordTargets = [],
  citationTargets = [],
}: {
  initial: PromptStrategyData;
  /** 이미 프롬프트 라이브러리에 있는 프롬프트 id — 서버가 매 로드마다 계산해서 넘긴다. */
  preTrackedIds?: string[];
  /** 브레인스토밍 마법사 1단계 프롬프트에 넣을 실측 토픽×브랜드 언급 표. */
  brainstormDigest?: string;
  /** "구글서치콘솔 분석" 마법사가 한 번에 등록할 실측 키워드 공백 목록. */
  gscKeywordTargets?: { keyword: string; impressions: number }[];
  /** "인용 테스트 분석" 마법사가 한 번에 등록할 실측 저클릭 페이지 목록. */
  citationTargets?: { url: string; impressions: number; clicks: number }[];
}) {
  const router = useRouter();
  const topics = initial.topics;
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => new Set(preTrackedIds));
  const [brainstormOpen, setBrainstormOpen] = useState(false);
  // 그룹 전체가 추적돼도 배너를 자동으로 숨기지 않는다 — "전체 추적 중"
  // 상태 자체가 유용한 정보라 계속 보여주고, 숨기고 싶으면 "닫기"를 직접
  // 누르게 한다.
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | StrategySource>("all");
  const [trackingTopic, setTrackingTopic] = useState<PromptStrategyTopicRow | null>(null);
  const [bulkGroupTopics, setBulkGroupTopics] = useState<PromptStrategyTopicRow[] | null>(null);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Set<string>>>({});
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  // 계속 프롬프트를 골라 추적하려는 사람 입장에서 매번 라이브러리로
  // 튕겨나가는 게 불편하다는 피드백 — 추적 성공 시 이 페이지에 남은 채
  // 토스트로 알리고, "라이브러리 확인"을 눌러야만 실제로 이동한다.
  const [trackSuccessCount, setTrackSuccessCount] = useState<number | null>(null);
  // 상단 요약 카드는 전부 추적된 항목까지 계속 보여주면 "다음에 뭘 해야
  // 하지"라는 신호가 희석되니 기본적으로 숨기고, 토글로 다시 볼 수 있게 한다.
  const [showFullyTrackedCards, setShowFullyTrackedCards] = useState(false);
  const [gscWizardOpen, setGscWizardOpen] = useState(false);
  const [citationWizardOpen, setCitationWizardOpen] = useState(false);

  // 상단 배너를 누르면 "전체" 탭으로 전환한 뒤 해당 그룹으로 스크롤 —
  // 필터가 바뀌어 DOM이 다시 그려진 다음에 스크롤해야 하므로 필터 변경과
  // 분리된 effect에서 처리한다.
  useEffect(() => {
    if (!pendingScrollId) return;
    const el = document.getElementById(`prompt-strategy-group-${pendingScrollId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScrollId(null);
  }, [pendingScrollId, filter]);

  function jumpToGroup(groupId: string) {
    setFilter("all");
    setPendingScrollId(groupId);
  }

  function toggleSelected(groupId: string, id: string) {
    setSelectedByGroup((prev) => {
      const next = new Set(prev[groupId] ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [groupId]: next };
    });
  }

  // 프롬프트 라이브러리의 "서브카테고리" 컬럼에 어떤 토픽(키워드/제안)에서
  // 추적됐는지 남기기 위한 라벨. 이전엔 이 값을 안 넘겨서 모든 프롬프트
  // 전략발 항목이 전부 "프롬프트 전략에서 추적"으로만 뭉뚱그려 보였다(어느
  // 키워드/토픽에서 왔는지 알 수 없었음). 그렇다고 제안 카드 제목을 그대로
  // 쓰면 큰따옴표가 섞인 문장(예: '"디맨드젠 vs 리드젠" 콘텐츠 인용
  // 테스트')이 그대로 서브카테고리에 들어가 다른 값들("GSC 커버리지 공백",
  // "Marketo"처럼 짧은 태그)과 형식이 안 맞는다 — 제목에서 따옴표 안 핵심
  // 키워드만 뽑아 "출처: 키워드" 형태의 짧은 라벨로 만든다.
  function groupTopicLabel(groupId: string | undefined): string | undefined {
    const s = initial.suggestions.find((x) => x.id === groupId);
    if (!s) return undefined;
    const keyword = s.title.match(/"([^"]+)"/)?.[1] ?? s.title;
    return `${SOURCE_LABEL[s.source]}: ${keyword}`;
  }

  // 가시성 개요의 "추적" 버튼과 동일하게 실제로 .tmp/tracked-topics에
  // 저장하고 프롬프트 라이브러리로 이동한다 — 이전엔 로컬 state만 바뀌고
  // 새로고침하면 사라졌고, 프롬프트 라이브러리에도 반영되지 않았다.
  async function handleTrack(id: string, promptText: string, category: string) {
    const groupId = topics.find((t) => t.id === id)?.groupId;
    setTrackedIds((prev) => new Set(prev).add(id));
    const res = await fetch("/api/tracked-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptText, category, subcategory: groupTopicLabel(groupId), source: "프롬프트 전략" }),
    });
    if (res.ok) setTrackSuccessCount(1);
  }

  async function handleTrackAll(rows: PromptStrategyTopicRow[], category: string, groupId?: string) {
    setTrackedIds((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
    if (groupId) {
      setSelectedByGroup((prev) => ({ ...prev, [groupId]: new Set() }));
    }
    const subcategoryLabel = groupTopicLabel(groupId);
    const results = await Promise.all(
      rows.map((r) =>
        fetch("/api/tracked-topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: r.topic, category, subcategory: subcategoryLabel, source: "프롬프트 전략" }),
        })
      )
    );
    if (results.some((res) => !res.ok)) {
      // eslint-disable-next-line no-console
      console.error("일부 프롬프트를 프롬프트 라이브러리에 추가하지 못했습니다.");
      return;
    }
    setTrackSuccessCount(rows.length);
  }

  const tabs = [
    { id: "all", label: "전체", badge: topics.length },
    { id: "gsc", label: "구글서치콘솔", badge: topics.filter((t) => t.source === "gsc").length },
    { id: "llm_brainstorm", label: "가상 사용자 질문", badge: topics.filter((t) => t.source === "llm_brainstorm").length },
    { id: "citation_attempt", label: "인용 테스트", badge: topics.filter((t) => t.source === "citation_attempt").length },
  ];

  const filteredSuggestions = initial.suggestions.filter((s) => filter === "all" || s.source === filter);

  function buildColumns(groupId: string, rows: PromptStrategyTopicRow[]): DataTableColumn<PromptStrategyTopicRow>[] {
    const selected = selectedByGroup[groupId] ?? new Set<string>();
    // LLM이 만든 프롬프트 문장(intent/branded/reasoning이 채워진 행)은
    // "노출 수 · 브랜드별 언급 수" 대신 Prompt/Market/Intent/Branded/Reasoning
    // 형식으로 보여준다 — 실제 검색어 클러스터 볼륨이 아니라 개별 프롬프트
    // 문장을 다루는 표라서 형식이 다르다.
    const isPromptFormat = rows.some((r) => r.intent !== undefined || r.branded !== undefined || r.reasoning !== undefined);

    const selectableRows = rows.filter((r) => !trackedIds.has(r.id));

    const selectColumn: DataTableColumn<PromptStrategyTopicRow> = {
      key: "select",
      label:
        selectableRows.length > 0 ? (
          <input
            type="checkbox"
            aria-label="이 그룹 전체 선택"
            checked={selectableRows.every((r) => selected.has(r.id))}
            ref={(el) => {
              if (el) el.indeterminate = selectableRows.some((r) => selected.has(r.id)) && !selectableRows.every((r) => selected.has(r.id));
            }}
            onChange={(e) => {
              setSelectedByGroup((prev) => {
                const next = new Set(prev[groupId] ?? []);
                selectableRows.forEach((r) => (e.target.checked ? next.add(r.id) : next.delete(r.id)));
                return { ...prev, [groupId]: next };
              });
            }}
            className="size-3.5 cursor-pointer accent-slate-800"
          />
        ) : null,
      width: "w-[32px]",
      render: (r) =>
        trackedIds.has(r.id) ? null : (
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelected(groupId, r.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="size-3.5 cursor-pointer accent-slate-800"
          />
        ),
    };

    const actionColumn: DataTableColumn<PromptStrategyTopicRow> = {
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
    };

    const marketColumn: DataTableColumn<PromptStrategyTopicRow> = {
      key: "market",
      label: "마켓",
      width: "w-[70px]",
      render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>,
    };

    if (isPromptFormat) {
      return [
        selectColumn,
        { key: "topic", label: "프롬프트", width: "w-[320px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
        marketColumn,
        {
          key: "intent",
          label: "Intent",
          width: "w-[100px]",
          render: (r) =>
            r.intent ? (
              <span className="rounded bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">{r.intent}</span>
            ) : (
              <span className="text-neutral-300">—</span>
            ),
        },
        {
          key: "branded",
          label: "Branded",
          width: "w-[80px]",
          render: (r) =>
            r.branded === undefined ? (
              <span className="text-neutral-300">—</span>
            ) : (
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  r.branded ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {r.branded ? "Yes" : "No"}
              </span>
            ),
        },
        {
          key: "reasoning",
          label: "Reasoning",
          width: "w-[200px]",
          render: (r) =>
            r.reasoning ? (
              <span title={r.reasoning} className="line-clamp-2 text-[11px] text-neutral-500">
                {r.reasoning}
              </span>
            ) : (
              <span className="text-neutral-300">—</span>
            ),
        },
        actionColumn,
      ];
    }

    // 브레인스토밍 그룹에는 GSC 노출 수가 애초에 없으므로(gscImpressions가
    // 항상 null) "—"만 반복되는 빈 컬럼을 보여주지 않고 아예 뺀다.
    const hasGscRows = rows.some((r) => r.source === "gsc");

    return [
      selectColumn,
      { key: "topic", label: "토픽", width: "w-[240px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
      marketColumn,
      ...(hasGscRows
        ? [
            {
              key: "gscImpressions",
              label: "검색 노출 수",
              width: "w-[100px]",
              render: (r: PromptStrategyTopicRow) =>
                r.gscImpressions === null ? <span className="text-neutral-300">—</span> : r.gscImpressions.toLocaleString("ko-KR"),
            } as DataTableColumn<PromptStrategyTopicRow>,
          ]
        : []),
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
      actionColumn,
    ];
  }

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

      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setGscWizardOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-6 cursor-pointer hover:border-slate-300 hover:bg-neutral-50"
        >
          <div className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <Search size={20} />
          </div>
          <span className="text-[13px] font-bold text-neutral-900">구글서치콘솔 분석</span>
        </button>
        <button
          type="button"
          onClick={() => setBrainstormOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-6 cursor-pointer hover:border-slate-300 hover:bg-neutral-50"
        >
          <div className="grid size-10 place-items-center rounded-lg bg-violet-50 text-violet-600">
            <Users size={20} />
          </div>
          <span className="text-[13px] font-bold text-neutral-900">가상 사용자 질문 분석</span>
        </button>
        <button
          type="button"
          onClick={() => setCitationWizardOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-6 cursor-pointer hover:border-slate-300 hover:bg-neutral-50"
        >
          <div className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-600">
            <Quote size={20} />
          </div>
          <span className="text-[13px] font-bold text-neutral-900">인용 테스트 분석</span>
        </button>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs font-medium text-neutral-500">모두 추적된 카드 표시</span>
        <button
          type="button"
          role="switch"
          aria-checked={showFullyTrackedCards}
          onClick={() => setShowFullyTrackedCards((v) => !v)}
          className={`flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
            showFullyTrackedCards ? "justify-end bg-slate-800" : "justify-start bg-neutral-300"
          }`}
        >
          <span className="size-4 rounded-full bg-white" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {initial.suggestions
          .filter((s) => !dismissedGroups.has(s.id))
          .filter((s) => {
            if (showFullyTrackedCards) return true;
            const groupTopics = topics.filter((t) => t.groupId === s.id);
            return !(groupTopics.length > 0 && groupTopics.every((t) => trackedIds.has(t.id)));
          })
          .map((s) => {
          const groupTopics = topics.filter((t) => t.groupId === s.id);
          const trackedCount = groupTopics.filter((t) => trackedIds.has(t.id)).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => jumpToGroup(s.id)}
              className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-left cursor-pointer hover:border-neutral-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_LABEL[s.tag].className}`}>
                  {TAG_LABEL[s.tag].text}
                </span>
                <span className="text-[11px] text-neutral-400">{SOURCE_LABEL[s.source]}</span>
              </div>
              <h3 className="text-sm font-bold text-neutral-900">{s.title}</h3>
              <p className="text-xs text-neutral-500">{s.summary}</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[11px] font-medium text-neutral-600">{s.stat}</p>
                {groupTopics.length > 0 && (
                  <span className="text-[11px] font-medium text-neutral-400">
                    {trackedCount}/{groupTopics.length} 추적중
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start justify-between gap-3">
        <Tabs variant="badge" items={tabs} value={filter} onChange={(id) => setFilter(id as typeof filter)} />
      </div>

      <div className="flex flex-col gap-4">
        {filteredSuggestions.map((s) => {
          const groupTopics = topics.filter((t) => t.groupId === s.id);
          const isDismissed = dismissedGroups.has(s.id);
          if (isDismissed) return null;
          const isEmpty = groupTopics.length === 0;
          const allTracked = !isEmpty && groupTopics.every((t) => trackedIds.has(t.id));
          const selectedIds = selectedByGroup[s.id] ?? new Set<string>();
          const selectedRows = groupTopics.filter((t) => selectedIds.has(t.id));
          const untrackedRows = groupTopics.filter((t) => !trackedIds.has(t.id));
          // 체크된 항목이 없으면 그룹 전체(아직 추적 안 한 것만)를 대상으로 한다 —
          // 사용자가 굳이 하나씩 체크하지 않아도 "전체 추적"이 기본 동작이 되도록.
          const trackTargetRows = selectedRows.length > 0 ? selectedRows : untrackedRows;

          return (
            <div key={s.id} id={`prompt-strategy-group-${s.id}`} className="scroll-mt-24 rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_LABEL[s.tag].className}`}>
                      {TAG_LABEL[s.tag].text}
                    </span>
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                      {SOURCE_LABEL[s.source]}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-neutral-900">{s.title}</h3>
                  <p className="max-w-3xl text-xs text-neutral-500">{s.summary}</p>
                  {s.gscTopPage && (
                    <p className="max-w-3xl text-[11px] text-blue-700">
                      이미 이 검색어로 노출되고 있는 페이지: <span className="font-medium">{s.gscTopPage}</span>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDismissedGroups((prev) => new Set(prev).add(s.id))}
                    className="rounded-md bg-neutral-100 px-3 py-1.5 text-[11px] font-bold text-neutral-600 cursor-pointer hover:bg-neutral-200"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    disabled={allTracked || isEmpty}
                    onClick={() => setBulkGroupTopics(trackTargetRows)}
                    className="rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer hover:bg-slate-700 disabled:cursor-default disabled:bg-neutral-300"
                  >
                    {allTracked
                      ? "모두 추적 중"
                      : selectedRows.length > 0
                        ? `선택 추적 (${selectedRows.length}) →`
                        : "전체 추적 →"}
                  </button>
                </div>
              </div>
              <div className="mt-4">
                {isEmpty ? (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-200 px-5 py-6 text-center text-xs text-neutral-400">
                    <p>
                      아직 이 키워드로 만든 프롬프트가 없습니다. 위 "
                      {s.source === "citation_attempt" ? "인용 테스트 분석" : "구글서치콘솔 분석"}" 버튼으로 한 번에 등록하세요.
                    </p>
                  </div>
                ) : (
                  <DataTable columns={buildColumns(s.id, groupTopics)} rows={groupTopics} getRowId={(r) => r.id} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TrackTopicModal
        target={
          trackingTopic
            ? { kind: "topic", id: trackingTopic.id, topic: trackingTopic.topic, market: trackingTopic.market }
            : null
        }
        onClose={() => setTrackingTopic(null)}
        onTrack={(target, category) => handleTrack(target.id, trackingTopic?.topic ?? target.id, category)}
      />

      <TrackTopicModal
        target={bulkGroupTopics && bulkGroupTopics.length > 0 ? { kind: "topic", id: "bulk", topic: bulkGroupTopics[0].topic, market: bulkGroupTopics[0].market } : null}
        onClose={() => setBulkGroupTopics(null)}
        onTrack={(_target, category) =>
          bulkGroupTopics && handleTrackAll(bulkGroupTopics, category, bulkGroupTopics[0]?.groupId)
        }
      />

      <LlmBulkBridgeModal
        open={gscWizardOpen}
        onClose={() => setGscWizardOpen(false)}
        title="구글서치콘솔 분석 — 프롬프트 일괄 등록"
        instructions="LLM API 연동 전까지, 아래 실측 검색어 전체에 대해 한 번에 자연어 질문을 만들어달라고 LLM에 물어본 뒤 답변을 붙여넣어 등록합니다."
        scope="gsc-keyword-prompts"
        promptText={
          gscKeywordTargets.length === 0
            ? "아직 GSC 커버리지 공백 검색어가 없습니다."
            : `Google Search Console에서 우리 사이트가 실제로 검색 노출을 받고 있지만 아직 프롬프트로 추적하지 않은 검색어들입니다:\n\n${gscKeywordTargets.map((t) => `- "${t.keyword}" (노출 ${t.impressions.toLocaleString("ko-KR")}회)`).join("\n")}\n\n각 검색어마다, 그 검색어로 검색하는 사람이 ChatGPT 같은 AI 챗봇에게 실제로 물어볼 법한 자연어 질문을 5개씩 만들어주세요. 브랜드명을 직접 언급하지 않는 카테고리/업체 추천형 질문 위주로 작성해주세요.\n\n반드시 아래 JSON 형식으로만, 검색어 전체에 대해 한 번에 답변하세요:\n{\n  "검색어1": [{"prompt": "질문 문장", "intent": "정보 탐색|업체 비교|도입 검토", "branded": false, "reasoning": "근거"}],\n  "검색어2": [...]\n}`
        }
        parse={(raw) => {
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
              return { error: "검색어를 key로 갖는 JSON 객체 형식이어야 합니다." };
            }
            for (const value of Object.values(parsed)) {
              if (!Array.isArray(value) || value.length === 0 || value.some((item: unknown) => typeof (item as { prompt?: unknown })?.prompt !== "string")) {
                return { error: "각 검색어 값은 prompt 필드를 가진 항목들의 배열이어야 합니다." };
              }
            }
            return { entries: parsed };
          } catch {
            return { error: "JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
          }
        }}
        onSaved={() => router.refresh()}
      />

      <LlmBulkBridgeModal
        open={citationWizardOpen}
        onClose={() => setCitationWizardOpen(false)}
        title="인용 테스트 분석 — 프롬프트 일괄 등록"
        instructions="LLM API 연동 전까지, 아래 실측 저클릭 페이지 전체에 대해 한 번에 인용 테스트 질문을 만들어달라고 LLM에 물어본 뒤 답변을 붙여넣어 등록합니다."
        scope="citation-test-prompts"
        promptText={
          citationTargets.length === 0
            ? "아직 인용 테스트 대상 페이지가 없습니다."
            : `다음은 Google Search Console 실측으로 노출은 많은데 클릭이 적은 우리 페이지들입니다:\n\n${citationTargets.map((t) => `- ${t.url} (노출 ${t.impressions.toLocaleString("ko-KR")}회, 클릭 ${t.clicks.toLocaleString("ko-KR")}회)`).join("\n")}\n\n각 URL마다, 그 페이지가 다룰 법한 주제를 URL로 추측해서 AI 챗봇(ChatGPT 등)이 답변의 출처로 이 페이지를 인용할 만한 자연어 질문을 3개씩 만들어주세요.\n\n반드시 아래 JSON 형식으로만, URL 전체에 대해 한 번에 답변하세요:\n{\n  "URL1": [{"prompt": "질문 문장", "intent": "정보 탐색|업체 비교|도입 검토", "branded": false, "reasoning": "근거"}],\n  "URL2": [...]\n}`
        }
        parse={(raw) => {
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
              return { error: "URL을 key로 갖는 JSON 객체 형식이어야 합니다." };
            }
            for (const value of Object.values(parsed)) {
              if (!Array.isArray(value) || value.length === 0 || value.some((item: unknown) => typeof (item as { prompt?: unknown })?.prompt !== "string")) {
                return { error: "각 URL 값은 prompt 필드를 가진 항목들의 배열이어야 합니다." };
              }
            }
            return { entries: parsed };
          } catch {
            return { error: "JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
          }
        }}
        onSaved={() => router.refresh()}
      />

      <BrainstormWizardModal
        open={brainstormOpen}
        onClose={() => setBrainstormOpen(false)}
        digest={brainstormDigest || "아직 수집된 데이터가 없습니다."}
        onSaved={() => router.refresh()}
      />

      {trackSuccessCount !== null && (
        <div className="fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
          <div className="flex-1">
            <p className="text-sm font-bold text-neutral-900">
              프롬프트 {trackSuccessCount}개를 프롬프트 라이브러리에 성공적으로 추가했습니다.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/prompt-library")}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer hover:bg-slate-700"
              >
                라이브러리 확인
              </button>
              <button
                type="button"
                onClick={() => setTrackSuccessCount(null)}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-[11px] font-bold text-neutral-600 cursor-pointer hover:bg-neutral-200"
              >
                전략 계속 탐색
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
