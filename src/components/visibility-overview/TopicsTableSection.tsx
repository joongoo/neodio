"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Download } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { FaviconIcon } from "@/components/ui/FaviconIcon";
import { TrackTarget, TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
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

function buildTopicColumns(trackedIds: Set<string>, onTrack: (row: TopicRow) => void): DataTableColumn<TopicRow>[] {
  return [
    { key: "topic", label: "토픽", width: "w-[280px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
    { key: "mentions", label: "언급 수", width: "w-[100px]", render: (r) => r.mentions },
    { key: "visibility", label: "가시성", width: "w-[100px]", render: (r) => `${r.visibility}%` },
    {
      key: "market",
      label: "마켓",
      width: "w-[90px]",
      render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>,
    },
    {
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
    },
  ];
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

const sourceColumns: DataTableColumn<CitedSourceRow>[] = [
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
];

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
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [trackTarget, setTrackTarget] = useState<TrackTarget | null>(null);

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

  const topicColumns = useMemo(
    () =>
      buildTopicColumns(trackedIds, (row) =>
        setTrackTarget({
          kind: "topic",
          id: row.id,
          topic: row.topic,
          market: row.market,
          prompts: row.prompts.map((p) => ({ id: p.id, prompt: p.prompt })),
        })
      ),
    [trackedIds]
  );
  const visibleTopicColumns = topicColumns.filter((c) => !["mentions", "visibility", "market"].includes(c.key) || visible.has(c.key));
  const visibleBrandColumns = brandColumns.filter((c) => c.key !== "mentions" || visible.has(c.key));
  const visiblePageColumns = pageColumns.filter((c) => !["responses", "market"].includes(c.key) || visible.has(c.key));
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
    </div>
  );
}
