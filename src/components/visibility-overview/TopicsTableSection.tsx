"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings, Download, Sparkles } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { FaviconIcon } from "@/components/ui/FaviconIcon";
import { TrackTarget, TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
import { LlmBridgeModal } from "@/components/ui/LlmBridgeModal";
import {
  BrandRankRow,
  CitedPageRow,
  CitedSourceRow,
  TopicCategory,
  TopicRow,
  VisibilityTableRow,
} from "@/lib/db";

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "top-prompts": "이미 브랜드가 언급된 토픽의 프롬프트입니다.",
  "topic-opportunities": "아직 브랜드가 언급되지 않은 토픽 기회입니다.",
  "latest-top-brands": "이 토픽에서 최근 가장 많이 언급된 브랜드입니다.",
  "cited-pages": "AI 답변에 가장 많이 인용된 페이지입니다.",
  "cited-sources": "AI 답변이 가장 많이 인용한 출처입니다.",
  "source-opportunities": "아직 우리 브랜드가 인용되지 않은 출처 기회입니다.",
};

// Topic-shaped categories keep the full prompt-level expansion; the other
// four categories (per neodigm_screens_documentation.md #2) each have their
// own column set — brand-rank, cited-page and cited-source rows are never
// reshaped into the topic table, unlike the Figma source (a documented bug).
const TOPIC_FAMILY = new Set(["top-prompts", "topic-opportunities"]);
const BRAND_FAMILY = new Set(["latest-top-brands"]);
const PAGE_FAMILY = new Set(["cited-pages"]);
const SOURCE_FAMILY = new Set(["cited-sources", "source-opportunities"]);

type Family = "topic" | "brand" | "page" | "source";

function familyOf(categoryId: string): Family {
  if (TOPIC_FAMILY.has(categoryId)) return "topic";
  if (BRAND_FAMILY.has(categoryId)) return "brand";
  if (PAGE_FAMILY.has(categoryId)) return "page";
  if (SOURCE_FAMILY.has(categoryId)) return "source";
  return "topic";
}

// Configure-columns modal (node 837:10983) only ever toggles the non-primary,
// non-action columns — each family's optional list below.
const OPTIONAL_COLUMNS: Record<Family, ColumnOption[]> = {
  topic: [
    { key: "mentions", label: "언급 수" },
    { key: "visibility", label: "가시성" },
    { key: "market", label: "마켓" },
  ],
  brand: [{ key: "mentions", label: "언급 수" }],
  page: [
    { key: "responses", label: "응답 수" },
    { key: "market", label: "마켓" },
  ],
  source: [
    { key: "market", label: "마켓" },
    { key: "myBrandMentions", label: "내 브랜드 언급 수" },
    { key: "citedPages", label: "인용된 페이지 수" },
    { key: "prompts", label: "프롬프트 수" },
  ],
};

// "토픽 기회" 전용 — 이 토픽으로 만든 콘텐츠 URL을 입력해두면 실제로
// 인용되는지(targetUrlCitations) 다음 로드부터 실측으로 보여준다.
function TargetUrlCell({ row, onSaved }: { row: TopicRow; onSaved: () => void }) {
  const [value, setValue] = useState(row.targetUrl ?? "");
  const [saving, setSaving] = useState(false);

  if (row.targetUrl) {
    return (
      <div className="flex flex-col gap-0.5">
        <a href={row.targetUrl} target="_blank" rel="noopener noreferrer" className="max-w-[220px] truncate text-xs text-blue-600 hover:underline">
          {row.targetUrl}
        </a>
        <span className="text-[11px] text-neutral-500">
          인용 {row.targetUrlCitations ?? 0}회
          {(row.targetUrlCitations ?? 0) > 0 ? " ✅" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="콘텐츠 URL (옵션)"
        className="h-7 w-[180px] rounded border border-neutral-300 px-2 text-[11px]"
      />
      <button
        type="button"
        disabled={!value.trim() || saving}
        onClick={async () => {
          setSaving(true);
          await fetch("/api/topic-opportunity-target", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: row.topic, targetUrl: value.trim() }),
          });
          setSaving(false);
          onSaved();
        }}
        className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200 disabled:cursor-default disabled:opacity-40"
      >
        저장
      </button>
    </div>
  );
}

function buildTopicColumns(
  trackedIds: Set<string>,
  onTrack: (row: TopicRow) => void,
  isOpportunity: boolean,
  onTargetUrlSaved: () => void
): DataTableColumn<TopicRow>[] {
  const base: DataTableColumn<TopicRow>[] = [
    {
      key: "topic",
      label: "토픽",
      width: "w-[240px]",
      render: (r) =>
        isOpportunity ? (
          <a
            href={`/opportunities/topic/${encodeURIComponent(r.topic)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:underline"
          >
            {r.topic}
          </a>
        ) : (
          <span className="text-neutral-700">{r.topic}</span>
        ),
    },
    { key: "mentions", label: "언급 수", width: "w-[100px]", render: (r) => r.mentions },
    { key: "visibility", label: "가시성", width: "w-[100px]", render: (r) => `${r.visibility}%` },
    {
      key: "market",
      label: "마켓",
      width: "w-[90px]",
      render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>,
    },
  ];

  if (isOpportunity) {
    base.push(
      {
        key: "addedToLibrary",
        label: "라이브러리",
        width: "w-[90px]",
        render: (r) =>
          r.addedToLibrary ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">추가됨</span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">미추가</span>
          ),
      },
      {
        key: "targetUrl",
        label: "콘텐츠 인용 트래킹",
        width: "w-[220px]",
        render: (r) => <TargetUrlCell row={r} onSaved={onTargetUrlSaved} />,
      }
    );
  }

  base.push({
    key: "action",
    width: "w-[100px]",
    label: "액션",
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
  });

  return base;
}

const brandColumns: DataTableColumn<BrandRankRow>[] = [
  { key: "brand", label: "브랜드", width: "w-[320px]", render: (r) => <span className="text-neutral-700">{r.brand}</span> },
  { key: "mentions", label: "언급 수", width: "w-[110px]", render: (r) => r.mentions.toLocaleString("ko-KR") },
];

function hostnameOf(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

const pageColumns: DataTableColumn<CitedPageRow>[] = [
  {
    key: "pageUrl",
    label: "페이지 URL",
    width: "w-[360px]",
    render: (r) => (
      <span className="flex items-center gap-2 truncate text-neutral-700">
        <FaviconIcon domain={hostnameOf(r.pageUrl)} />
        {r.pageUrl}
      </span>
    ),
  },
  { key: "responses", label: "응답 수", width: "w-[110px]", render: (r) => r.responses },
  {
    key: "market",
    label: "마켓",
    width: "w-[90px]",
    render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>,
  },
];

// LLM API 연동 전까지는 "DB 등록" 버튼으로 사람이 LlmBridgeModal을 통해
// 추천/근거를 채운다 — onRegister가 그 모달을 연다.
function buildSourceColumns(onRegister: (row: CitedSourceRow) => void): DataTableColumn<CitedSourceRow>[] {
  return [
    {
      key: "domain",
      label: "도메인",
      width: "w-[220px]",
      render: (r) => (
        <span className="flex items-center gap-2 text-neutral-700">
          <FaviconIcon domain={r.domain} />
          {r.domain}
        </span>
      ),
    },
    {
      key: "market",
      label: "마켓",
      width: "w-[90px]",
      render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>,
    },
    { key: "myBrandMentions", label: "내 브랜드 언급 수", width: "w-[130px]", render: (r) => r.myBrandMentions },
    { key: "citedPages", label: "인용된 페이지 수", width: "w-[130px]", render: (r) => r.citedPages },
    { key: "prompts", label: "프롬프트 수", width: "w-[110px]", render: (r) => r.prompts },
    {
      key: "recommendation",
      label: "추천 액션",
      width: "w-[220px]",
      render: (r) =>
        r.recommendation ? (
          <span title={r.reasoning} className="line-clamp-2 text-[11px] text-neutral-600">
            {r.recommendation}
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegister(r);
            }}
            className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
          >
            <Sparkles size={12} />
            DB 등록
          </button>
        ),
    },
  ];
}

function isTopicRow(row: VisibilityTableRow): row is TopicRow {
  return "topic" in row;
}

function allKeys(family: Family) {
  return new Set(OPTIONAL_COLUMNS[family].map((c) => c.key));
}

export function TopicsTableSection({
  categories,
  topicsByCategory,
}: {
  categories: TopicCategory[];
  topicsByCategory: Record<string, VisibilityTableRow[]>;
}) {
  const router = useRouter();
  // "기회" 페이지의 "토픽 기회" 카드처럼 ?category=topic-opportunities로
  // 바로 들어와서 해당 탭이 열리게 한다 — 없으면 기존처럼 첫 카테고리.
  const searchParams = useSearchParams();
  const initialCategoryId = searchParams.get("category");
  const [categoryId, setCategoryId] = useState(
    (initialCategoryId && categories.some((c) => c.id === initialCategoryId) ? initialCategoryId : categories[0]?.id) ?? ""
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [trackTarget, setTrackTarget] = useState<TrackTarget | null>(null);
  const [registeringSource, setRegisteringSource] = useState<CitedSourceRow | null>(null);

  // 실제로 프롬프트 라이브러리에 저장(.tmp/tracked-topics)한 뒤 그 화면으로
  // 이동한다 — 이전엔 클라이언트 로컬 state만 바뀌고 새로고침하면 사라졌고,
  // 프롬프트 라이브러리에도 전혀 반영되지 않았다. 토픽 단위 추적은 그 토픽의
  // 프롬프트마다 한 번씩 저장 — 모달이 "N개 프롬프트가 추가됩니다"라고 알려준
  // 그대로 실제로 N개가 생긴다.
  async function handleTrack(target: TrackTarget, category: string) {
    setTrackedIds((prev) => new Set(prev).add(target.id));
    const source = "가시성 개요";
    const requests =
      target.kind === "topic"
        ? (target.prompts ?? []).map((p) => ({ prompt: p.prompt, category, topic: target.topic, source }))
        : [{ prompt: target.prompt, category, topic: target.topic, source }];
    await Promise.all(
      requests.map((body) =>
        fetch("/api/tracked-topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      )
    );
    router.push("/prompt-library");
  }
  const [visibleByFamily, setVisibleByFamily] = useState<Record<Family, Set<string>>>({
    topic: allKeys("topic"),
    brand: allKeys("brand"),
    page: allKeys("page"),
    source: allKeys("source"),
  });

  const category = categories.find((c) => c.id === categoryId);
  const allRows = useMemo(() => topicsByCategory[categoryId] ?? [], [topicsByCategory, categoryId]);
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const rows = useMemo(() => allRows.slice((page - 1) * pageSize, page * pageSize), [allRows, page, pageSize]);

  function selectCategory(id: string) {
    setCategoryId(id);
    setPage(1);
  }

  const family = familyOf(categoryId);
  const isTopicFamily = family === "topic";
  const isBrandFamily = family === "brand";
  const isPageFamily = family === "page";
  const isSourceFamily = family === "source";
  const visible = visibleByFamily[family];

  const isTopicOpportunities = categoryId === "topic-opportunities";
  const topicColumns = useMemo(
    () =>
      buildTopicColumns(
        trackedIds,
        (row) =>
          setTrackTarget({
            kind: "topic",
            id: row.id,
            topic: row.topic,
            market: row.market,
            prompts: row.prompts.map((p) => ({ id: p.id, prompt: p.prompt })),
          }),
        isTopicOpportunities,
        () => router.refresh()
      ),
    [trackedIds, isTopicOpportunities, router]
  );
  const visibleTopicColumns = topicColumns.filter((c) => !["mentions", "visibility", "market"].includes(c.key) || visible.has(c.key));
  const visibleBrandColumns = brandColumns.filter((c) => c.key !== "mentions" || visible.has(c.key));
  const visiblePageColumns = pageColumns.filter((c) => !["responses", "market"].includes(c.key) || visible.has(c.key));
  const sourceColumns = useMemo(() => buildSourceColumns((row) => setRegisteringSource(row)), []);
  const visibleSourceColumns = sourceColumns.filter(
    (c) => !["market", "myBrandMentions", "citedPages", "prompts"].includes(c.key) || visible.has(c.key)
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Tabs
        variant="badge"
        items={categories.map((c) => ({ id: c.id, label: c.label, badge: c.badge }))}
        value={categoryId}
        onChange={selectCategory}
      />

      <div className="mt-4 flex items-start gap-3">
        <div className="flex-1">
          <h3 className="text-base font-bold text-neutral-900">{category?.label}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">{CATEGORY_DESCRIPTIONS[categoryId] ?? ""}</p>
        </div>
        <button
          type="button"
          aria-label="컬럼 설정"
          onClick={() => setColumnsOpen(true)}
          className="grid size-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
        >
          <Settings size={16} />
        </button>
        <Button variant="primary" icon={<Download size={16} />}>
          내보내기
        </Button>
      </div>

      {isTopicOpportunities && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3">
          <Sparkles size={16} className="shrink-0 text-neutral-400" />
          <p className="text-xs text-neutral-500">
            토픽 이름을 눌러 상세 페이지로 들어가면 "가이드 등록" 버튼으로 이 토픽에 어떤 콘텐츠를 만들면 좋을지 LLM에게 물어본
            답변을 등록할 수 있습니다.
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2.5">
        {isTopicFamily && <Dropdown label="" value="AI 가시성: 전체" bold options={["AI 가시성: 전체"]} />}
        <div className="flex h-10 w-[189px] items-center justify-end rounded-md border border-neutral-300 px-3">
          <span className="text-xs text-neutral-500">0/{category?.badge ?? allRows.length}</span>
        </div>
      </div>

      <div className="mt-4">
        {isTopicFamily && (
          <DataTable
            columns={visibleTopicColumns}
            rows={rows.filter(isTopicRow)}
            getRowId={(r) => r.id}
            renderExpanded={(row) => (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-2 text-xs font-bold text-neutral-500">
                  <span className="w-[280px]">프롬프트</span>
                  <span className="w-[110px]">모델</span>
                  <span className="w-[70px]">내 브랜드</span>
                  <span className="w-[70px]">브랜드</span>
                  <span className="w-[70px]">소스</span>
                  <span className="w-[70px]">마켓</span>
                  <span className="w-[70px]">액션</span>
                </div>
                {row.prompts.map((p) => {
                  const trackId = `${row.id}-${p.id}`;
                  return (
                    <div key={p.id} className="flex items-center gap-3 text-xs text-neutral-700">
                      <span className="w-[280px] truncate">{p.prompt}</span>
                      <span className="w-[110px]">{p.model}</span>
                      <span className="w-[70px]">{p.myBrand}</span>
                      <span className="w-[70px]">{p.brand}</span>
                      <span className="w-[70px]">{p.source}</span>
                      <span className="w-[70px]">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{p.market}</span>
                      </span>
                      <span className="w-[70px]">
                        {trackedIds.has(trackId) ? (
                          <span className="text-[11px] font-medium text-emerald-600">추적 중</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setTrackTarget({
                                kind: "prompt",
                                id: trackId,
                                prompt: p.prompt,
                                topic: row.topic,
                                market: p.market,
                              })
                            }
                            className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer"
                          >
                            추적
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          />
        )}

        {isBrandFamily && (
          <DataTable columns={visibleBrandColumns} rows={rows as BrandRankRow[]} getRowId={(r) => r.id} />
        )}

        {isPageFamily && (
          <DataTable
            columns={visiblePageColumns}
            rows={rows as CitedPageRow[]}
            getRowId={(r) => r.id}
            renderExpanded={(row) => (
              <div className="flex items-center gap-2 text-xs text-neutral-700">
                <span className="font-semibold text-neutral-500">내 브랜드</span>
                <span>{row.myBrand}건</span>
              </div>
            )}
          />
        )}

        {isSourceFamily && (
          <DataTable columns={visibleSourceColumns} rows={rows as CitedSourceRow[]} getRowId={(r) => r.id} />
        )}
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalCount={allRows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <ConfigureColumnsModal
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={OPTIONAL_COLUMNS[family]}
        visible={visible}
        onApply={(next) => setVisibleByFamily((prev) => ({ ...prev, [family]: next }))}
      />

      <TrackTopicModal
        target={trackTarget}
        onClose={() => setTrackTarget(null)}
        onTrack={(target, category) => handleTrack(target, category)}
      />

      {registeringSource && (
        <LlmBridgeModal
          open={registeringSource !== null}
          onClose={() => setRegisteringSource(null)}
          title={`${registeringSource.domain} 공략 추천 등록`}
          instructions="LLM API 연동 전까지, 이 소스를 어떻게 공략하면 좋을지 LLM에게 직접 물어본 뒤 답변을 붙여넣어 등록합니다."
          scope="source-recommendation"
          itemKey={registeringSource.domain}
          promptText={`도메인 "${registeringSource.domain}"이(가) 우리 브랜드 관련 AI 답변에서 ${registeringSource.prompts}개 프롬프트에 걸쳐 인용되고 있는데, 우리 브랜드 언급은 ${registeringSource.myBrandMentions}건뿐입니다.\n이 도메인에 어떤 콘텐츠를 기고하거나 어떻게 접근하면 우리 브랜드가 이 소스에서도 함께 언급/인용될 수 있을지 추천해주세요.\n\n반드시 아래 JSON 형식으로만 답변하세요:\n{"recommendation": "실행 가능한 한 문장 추천", "reasoning": "왜 이 추천이 유효한지 근거"}`}
          parse={(raw) => {
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed.recommendation !== "string" || !parsed.recommendation.trim()) {
                return { error: "recommendation 필드가 없습니다. JSON 형식을 확인해주세요." };
              }
              return { data: { recommendation: parsed.recommendation, reasoning: parsed.reasoning ?? "" } };
            } catch {
              return { error: "JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
            }
          }}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
