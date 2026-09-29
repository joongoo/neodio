"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Settings, Sparkles } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { FaviconIcon } from "@/components/ui/FaviconIcon";
import { Sparkline } from "@/components/ui/Sparkline";
import { TrackTarget, TrackTopicModal } from "@/components/prompt-strategy/TrackTopicModal";
import { LlmBridgeModal } from "@/components/ui/LlmBridgeModal";
import { formatRunAt } from "@/lib/formatRunAt";
import { BrandOptimizationModal } from "@/components/brands-management/BrandOptimizationModal";
import {
  allowsPartnerRole,
  BRAND_KINDS,
  BRAND_KIND_LABEL,
  COMPETITOR_TIERS,
  TIER_LABEL,
  type BrandEvidence,
  type BrandKind,
  type CompetitorTier,
  type BrandOptimizationPlan,
  type OptimizationCompetitor,
  type OptimizationOwnBrand,
} from "@/lib/brandOptimization";
import {
  countBrandRows,
  DEFAULT_ROLE_FILTER,
  DEFAULT_TIER_FILTER,
  filterBrandRows,
  rowKey,
  type BrandRoleInfo,
  type RoleBucket,
  type TierBucket,
} from "@/lib/brandRankFilter";
import { BrandRoleFilter } from "@/components/visibility-overview/BrandRoleFilter";
import {
  BrandRankRow,
  CitedPageRow,
  CitedSourceRow,
  DateRange,
  TopicCategory,
  TopicRow,
  VisibilityTableRow,
} from "@/lib/db";
import { useTenantBase } from "@/lib/useTenantBase";

const RANGE_WEEKS: Record<DateRange, number> = { "1w": 1, "2w": 2, "4w": 4 };

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "top-prompts": "이미 브랜드가 언급된 토픽의 프롬프트입니다.",
  "topic-opportunities": "아직 브랜드가 언급되지 않은 토픽 기회입니다.",
  "latest-top-brands": "수집된 답변 로그에서 많이 언급된 브랜드입니다. 역할로 걸러 보고, 여러 개를 골라 한 번에 역할을 바꿀 수 있습니다.",
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
  brand: [{ key: "mentions", label: "언급 답변 수" }],
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

// "콘텐츠 인용 트래킹"(타겟 URL 입력/인용 확인)은 이 테이블에서 빼고 토픽
// 상세 페이지(TopicOpportunityDetailClient)에만 둔다 — 테이블 행마다 입력
// 필드를 두면 좁아서 실제로 잘 안 쓰였고, 토픽 이름을 눌러 상세로 들어가면
// 어차피 같은 기능을 더 넓은 화면에서 쓸 수 있다.
// 실행들을 주(일요일 시작) 단위로 묶어 각 주의 언급률(0~100)을 시간순
// 배열로 만든다 — Sparkline 하나가 이 배열을 그대로 그린다. 토픽 표 자체는
// 전체 기간 집계라 상단 "기간" 필터의 영향을 안 받지만(getRealTopicRows
// 주석 참고), 이 컬럼 이름이 "추이"라 필터를 무시하면 혼란스럽다 — 그래서
// range만큼의 최근 주차로 잘라서 최소한 스파크라인은 필터에 반응하게 한다.
function weeklyMentionTrend(prompts: TopicRow["prompts"], range: DateRange): number[] {
  const withDates = prompts.filter((p) => p.runAt);
  if (withDates.length < 2) return [];
  const byWeek = new Map<string, { total: number; mentioned: number }>();
  for (const p of withDates) {
    const d = new Date(p.runAt!);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const week = d.toISOString().slice(0, 10);
    const bucket = byWeek.get(week) ?? { total: 0, mentioned: 0 };
    bucket.total += 1;
    if (p.myBrand === "노출") bucket.mentioned += 1;
    byWeek.set(week, bucket);
  }
  const weeks = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { total, mentioned }]) => Math.round((mentioned / total) * 100));
  return weeks.slice(-RANGE_WEEKS[range]);
}

function buildTopicColumns(
  trackedIds: Set<string>,
  onTrack: (row: TopicRow) => void,
  isOpportunity: boolean,
  range: DateRange,
  tenantBase: string
): DataTableColumn<TopicRow>[] {
  const base: DataTableColumn<TopicRow>[] = [
    {
      key: "topic",
      label: "토픽",
      width: "w-[240px]",
      render: (r) =>
        isOpportunity ? (
          <a
            href={`${tenantBase}/opportunities/topic/${encodeURIComponent(r.topic)}`}
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
      key: "trend",
      label: "추이",
      width: "w-[80px]",
      render: (r) => <Sparkline values={weeklyMentionTrend(r.prompts, range)} />,
    },
    {
      key: "market",
      label: "마켓",
      width: "w-[90px]",
      render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>,
    },
  ];

  if (isOpportunity) {
    base.push({
      key: "addedToLibrary",
      label: "라이브러리",
      width: "w-[90px]",
      render: (r) =>
        r.addedToLibrary ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">추가됨</span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">미추가</span>
        ),
    });
  }

  base.push({
    key: "action",
    width: "w-[100px]",
    label: "액션",
    render: (r) =>
      trackedIds.has(r.id) || r.addedToLibrary ? (
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

type RoleChoice = BrandKind | "excluded";

// 브랜드 표 — 선택 체크박스 · 브랜드 · 역할(경쟁사면 등급) · 언급 답변 수. 역할·등급은 행에서 바로 바꾼다
// (신규 후보는 역할을 고르면 기타 브랜드로 등록, "제외"는 업체가 아닌 것으로 목록에서 뺀다).
function buildBrandColumns(opts: {
  roleInfo: Map<string, BrandRoleInfo>;
  suggestedNames: Set<string>;
  allowPartner: boolean;
  selectedIds: Set<string>;
  pageRows: BrandRankRow[];
  onToggleRow: (row: BrandRankRow) => void;
  onTogglePage: (rows: BrandRankRow[], checked: boolean) => void;
  onChangeRole: (row: BrandRankRow, choice: RoleChoice) => void;
  onChangeTier: (row: BrandRankRow, tier: CompetitorTier | null) => void;
}): DataTableColumn<BrandRankRow>[] {
  const selectable = opts.pageRows.filter((r) => !r.isOwn);
  const allSelected = selectable.length > 0 && selectable.every((r) => opts.selectedIds.has(r.id));
  const kinds = BRAND_KINDS.filter((k) => k !== "partner" || opts.allowPartner);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const selectClass = "h-7 rounded border border-neutral-300 bg-white px-1.5 text-[11px] text-neutral-800";

  return [
    {
      key: "select",
      label: (
        <input
          type="checkbox"
          aria-label="현재 페이지 전체 선택"
          checked={allSelected}
          disabled={selectable.length === 0}
          onChange={(e) => opts.onTogglePage(selectable, e.target.checked)}
        />
      ),
      width: "w-[32px]",
      render: (r) =>
        r.isOwn ? null : (
          <input
            type="checkbox"
            aria-label={`${r.brand} 선택`}
            checked={opts.selectedIds.has(r.id)}
            onClick={stop}
            onChange={() => opts.onToggleRow(r)}
          />
        ),
    },
    {
      key: "brand",
      label: "브랜드",
      width: "w-[280px]",
      render: (r) => (
        <span className="flex items-center gap-2 truncate text-neutral-700">
          {r.brand}
          {r.isOwn && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">자사</span>}
          {opts.suggestedNames.has(rowKey(r)) && (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">AI 제안(미검증)</span>
          )}
        </span>
      ),
    },
    {
      key: "role",
      label: "역할",
      width: "w-[260px]",
      render: (r) => {
        if (r.isOwn) return <span className="text-neutral-400">자사</span>;
        const info = opts.roleInfo.get(rowKey(r));
        return (
          <span className="flex items-center gap-1.5" onClick={stop}>
            <select
              aria-label={`${r.brand} 역할`}
              value={info?.kind ?? ""}
              onChange={(e) => e.target.value && opts.onChangeRole(r, e.target.value as RoleChoice)}
              className={selectClass}
            >
              {!info?.kind && (
                <option value="" disabled>
                  분류 전
                </option>
              )}
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {BRAND_KIND_LABEL[k]}
                </option>
              ))}
              <option value="excluded">제외 (업체 아님)</option>
            </select>
            {info?.kind === "competitor" && (
              <select
                aria-label={`${r.brand} 경쟁사 등급`}
                value={info.tier ?? ""}
                onChange={(e) => opts.onChangeTier(r, (e.target.value || null) as CompetitorTier | null)}
                className={selectClass}
              >
                <option value="">등급 미정</option>
                {COMPETITOR_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </span>
        );
      },
    },
    { key: "mentions", label: "언급 답변 수", width: "w-[110px]", render: (r) => r.mentions.toLocaleString("ko-KR") },
  ];
}

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

export interface BrandOptimizationContext {
  own: OptimizationOwnBrand;
  registered: OptimizationCompetitor[];
  /** 역할 분류 근거(브랜드 이름 → 답변 수 등). 없으면 이름 정리만 한다. */
  evidence?: Record<string, BrandEvidence>;
}

function allKeys(family: Family) {
  return new Set(OPTIONAL_COLUMNS[family].map((c) => c.key));
}

export function TopicsTableSection({
  categories,
  topicsByCategory,
  brandContext,
  range,
}: {
  categories: TopicCategory[];
  topicsByCategory: Record<string, VisibilityTableRow[]>;
  brandContext: BrandOptimizationContext | null;
  /** 토픽 표 자체는 range와 무관한 전체 기간 집계지만, "추이" 스파크라인만
   *  이 값만큼의 최근 주차로 잘라서 보여준다. */
  range: DateRange;
}) {
  const router = useRouter();
  const tenantBase = useTenantBase();
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
  const [groupingOpen, setGroupingOpen] = useState(false);
  // "최신 상위 브랜드" 표 — 역할 필터(자사·경쟁사가 기본)와 일괄 변경용 선택 상태.
  const [roleFilter, setRoleFilter] = useState<Set<RoleBucket>>(new Set(DEFAULT_ROLE_FILTER));
  const [tierFilter, setTierFilter] = useState<Set<TierBucket>>(new Set(DEFAULT_TIER_FILTER));
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [brandOptimizationOpen, setBrandOptimizationOpen] = useState(false);

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
    router.push(`${tenantBase}/prompt-library`);
  }
  const [visibleByFamily, setVisibleByFamily] = useState<Record<Family, Set<string>>>({
    topic: allKeys("topic"),
    brand: allKeys("brand"),
    page: allKeys("page"),
    source: allKeys("source"),
  });

  const category = categories.find((c) => c.id === categoryId);
  // 역할 필터는 "최신 상위 브랜드"에만 걸린다. 제외 처리한 브랜드는 항상 숨긴다.
  const roleInfo = useMemo(() => {
    const map = new Map<string, BrandRoleInfo>();
    for (const b of brandContext?.registered ?? []) map.set(b.name.toLocaleLowerCase("ko-KR"), { kind: b.kind, tier: b.tier });
    return map;
  }, [brandContext]);
  const allBrandRows = useMemo(
    () => (topicsByCategory["latest-top-brands"] ?? []).filter((row): row is BrandRankRow => "brand" in row),
    [topicsByCategory]
  );
  const brandCounts = useMemo(() => countBrandRows(allBrandRows, roleInfo), [allBrandRows, roleInfo]);
  const allRows = useMemo(() => {
    if (categoryId === "latest-top-brands") return filterBrandRows(allBrandRows, roleInfo, roleFilter, tierFilter);
    return topicsByCategory[categoryId] ?? [];
  }, [topicsByCategory, categoryId, allBrandRows, roleInfo, roleFilter, tierFilter]);
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

  // 재그룹핑용 원본 프롬프트 목록 — 이미 토픽으로 묶인 행이 있으면 그 안의
  // prompts[].prompt(진짜 프롬프트 원문)까지 펼쳐서 전체 목록을 복원한다.
  const allPromptTexts = useMemo(() => {
    const texts = new Set<string>();
    for (const key of ["top-prompts", "topic-opportunities"]) {
      for (const row of topicsByCategory[key] ?? []) {
        if (isTopicRow(row)) row.prompts.forEach((p) => texts.add(p.prompt));
      }
    }
    return [...texts];
  }, [topicsByCategory]);
  const groupingPromptText = `다음은 우리 브랜드에 대해 수집한 개별 프롬프트(질문) 목록입니다. 의미상 같은 주제를 가리키는 프롬프트끼리 하나의 토픽으로 묶어주세요.\n- 목록에 있는 프롬프트를 빠짐없이, 정확히 하나의 토픽에만 포함하세요.\n- 토픽 이름은 10자 내외의 짧은 명사구로 지어주세요.\n- 서로 뚜렷이 다른 주제를 억지로 묶지 마세요(그런 경우 프롬프트 하나만 있는 토픽이어도 괜찮습니다).\n\n반드시 아래 JSON 배열 형식으로만 답변하세요:\n[{"topic": "토픽 이름", "prompts": ["프롬프트 원문 그대로", "..."]}, ...]\n\n프롬프트 목록:\n${allPromptTexts.map((p) => `- ${p}`).join("\n")}`;

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
        range,
        tenantBase
      ),
    [trackedIds, isTopicOpportunities, range, tenantBase]
  );
  const visibleTopicColumns = topicColumns.filter((c) => !["mentions", "visibility", "market"].includes(c.key) || visible.has(c.key));
  // 역할·등급 변경(행 하나 또는 선택한 여러 개) — 서버가 등록·제외까지 처리한다. 끝나면 서버 데이터를 다시 불러온다.
  const applyRoleChanges = useCallback(
    async (targets: BrandRankRow[], choice: RoleChoice, tier?: CompetitorTier | null) => {
      const res = await fetch("/api/detected-brand-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "roles",
          items: targets.map((row) => ({ name: row.brand, kind: choice, tier, evidenceDomain: row.evidenceDomain })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error ?? "역할을 저장하지 못했습니다.");
        return;
      }
      setSelectedBrandIds(new Set());
      router.refresh();
    },
    [router]
  );
  // 브랜드 최적화에 넘기는 후보는 화면 필터와 무관하게 제외·자사를 뺀 전체다.
  const optimizationCandidates = useMemo(() => allBrandRows.filter((row) => row.decisionStatus !== "excluded" && !row.isOwn), [allBrandRows]);
  const selectedBrandRows = useMemo(() => allBrandRows.filter((row) => !row.isOwn && selectedBrandIds.has(row.id)), [allBrandRows, selectedBrandIds]);
  const suggestedNames = useMemo(
    () => new Set((brandContext?.registered ?? []).filter((b) => b.origin === "ai-suggested").map((b) => b.name.toLocaleLowerCase("ko-KR"))),
    [brandContext]
  );
  const partnerAllowed = brandContext ? allowsPartnerRole(brandContext.own) : false;
  const showPartnerFilter = partnerAllowed && brandCounts.roles.partner > 0;
  function changeFilter(roles: Set<RoleBucket>, tiers: Set<TierBucket>) {
    setRoleFilter(roles);
    setTierFilter(tiers);
    setPage(1);
  }
  const pageBrandRows = useMemo(() => rows.filter((row): row is BrandRankRow => "brand" in row), [rows]);
  const brandColumns = useMemo(
    () =>
      buildBrandColumns({
        roleInfo,
        suggestedNames,
        allowPartner: partnerAllowed,
        selectedIds: selectedBrandIds,
        pageRows: pageBrandRows,
        onToggleRow: (row) =>
          setSelectedBrandIds((prev) => {
            const next = new Set(prev);
            if (next.has(row.id)) next.delete(row.id);
            else next.add(row.id);
            return next;
          }),
        onTogglePage: (list, checked) =>
          setSelectedBrandIds((prev) => {
            const next = new Set(prev);
            for (const row of list) {
              if (checked) next.add(row.id);
              else next.delete(row.id);
            }
            return next;
          }),
        onChangeRole: (row, choice) => void applyRoleChanges([row], choice),
        onChangeTier: (row, tier) => void applyRoleChanges([row], "competitor", tier),
      }),
    [roleInfo, suggestedNames, partnerAllowed, selectedBrandIds, pageBrandRows, applyRoleChanges]
  );
  const visibleBrandColumns = brandColumns.filter((c) => !["mentions"].includes(c.key) || visible.has(c.key));
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
        {isTopicFamily && allPromptTexts.length > 0 && (
          <Button variant="secondary" icon={<Sparkles size={16} />} onClick={() => setGroupingOpen(true)}>
            AI로 토픽 묶기
          </Button>
        )}
        <button
          type="button"
          aria-label="컬럼 설정"
          onClick={() => setColumnsOpen(true)}
          className="grid size-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
        >
          <Settings size={16} />
        </button>
        {isBrandFamily && optimizationCandidates.length > 0 && (
          <Button variant="secondary" icon={<Sparkles size={16} />} onClick={() => setBrandOptimizationOpen(true)}>
            브랜드 최적화
          </Button>
        )}
        <Button variant="primary" icon={<Download size={16} />}>
          내보내기
        </Button>
      </div>

      {isTopicOpportunities && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3">
          <Sparkles size={16} className="shrink-0 text-neutral-400" />
          <p className="text-xs text-neutral-500">
            토픽 이름을 눌러 상세 페이지로 들어가면 가이드 등록 버튼으로 이 토픽에 어떤 콘텐츠를 만들면 좋을지 LLM에게 물어본
            답변을 등록할 수 있습니다.
          </p>
        </div>
      )}

      {isBrandFamily ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <BrandRoleFilter roles={roleFilter} tiers={tierFilter} counts={brandCounts} showPartner={showPartnerFilter} onChange={changeFilter} />
            <span className="ml-auto text-xs text-neutral-500">
              {allRows.length.toLocaleString("ko-KR")}개 표시 · 전체 {(allBrandRows.length - brandCounts.excluded).toLocaleString("ko-KR")}개
            </span>
          </div>
          {selectedBrandRows.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-xs">
              <span className="font-bold text-slate-800">{selectedBrandRows.length}개 선택</span>
              <select
                aria-label="선택한 브랜드 역할 변경"
                value=""
                onChange={(e) => e.target.value && void applyRoleChanges(selectedBrandRows, e.target.value as RoleChoice)}
                className="h-8 rounded border border-neutral-300 bg-white px-2 text-xs"
              >
                <option value="">역할 변경…</option>
                {BRAND_KINDS.filter((k) => k !== "partner" || partnerAllowed).map((k) => (
                  <option key={k} value={k}>
                    {BRAND_KIND_LABEL[k]}(으)로
                  </option>
                ))}
                <option value="excluded">제외 (업체 아님)</option>
              </select>
              <select
                aria-label="선택한 경쟁사 등급 변경"
                value=""
                onChange={(e) => e.target.value && void applyRoleChanges(selectedBrandRows, "competitor", e.target.value === "none" ? null : (e.target.value as CompetitorTier))}
                className="h-8 rounded border border-neutral-300 bg-white px-2 text-xs"
              >
                <option value="">경쟁사로 지정 + 등급…</option>
                {COMPETITOR_TIERS.map((t) => (
                  <option key={t} value={t}>
                    경쟁사 · {TIER_LABEL[t]}
                  </option>
                ))}
                <option value="none">경쟁사 · 등급 미정</option>
              </select>
              <button type="button" onClick={() => void applyRoleChanges(selectedBrandRows, "excluded")} className="h-8 rounded bg-white px-3 font-bold text-red-700 ring-1 ring-red-200 cursor-pointer hover:bg-red-50">
                목록에서 제외
              </button>
              <button type="button" onClick={() => setSelectedBrandIds(new Set())} className="ml-auto text-neutral-500 cursor-pointer hover:underline">
                선택 해제
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 flex items-center justify-end gap-2.5">
          {isTopicFamily && <Dropdown label="" value="AI 가시성: 전체" bold options={["AI 가시성: 전체"]} />}
          <div className="flex h-10 w-[189px] items-center justify-end rounded-md border border-neutral-300 px-3">
            <span className="text-xs text-neutral-500">0/{category?.badge ?? allRows.length}</span>
          </div>
        </div>
      )}

      <div className="mt-4">
        {isTopicFamily && (
          <DataTable
            columns={visibleTopicColumns}
            rows={rows.filter(isTopicRow)}
            getRowId={(r) => r.id}
            renderExpanded={(row) => {
              return (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-2 text-xs font-bold text-neutral-500">
                  <span className="w-[240px]">프롬프트</span>
                  <span className="w-[70px]">실행일</span>
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
                      <span className="w-[240px] truncate" title={p.prompt}>{p.prompt}</span>
                      <span className="w-[70px] shrink-0 text-neutral-500">{formatRunAt(p.runAt)}</span>
                      <span className="w-[110px]">{p.model}</span>
                      <span className="w-[70px]">{p.myBrand}</span>
                      <span className="w-[70px]">{p.brand}</span>
                      <span className="w-[70px]">{p.source}</span>
                      <span className="w-[70px]">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{p.market}</span>
                      </span>
                      <span className="w-[70px]">
                        {trackedIds.has(trackId) || p.addedToLibrary ? (
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
              );
            }}
          />
        )}

        {isBrandFamily && (
          <DataTable
            columns={visibleBrandColumns}
            rows={rows as BrandRankRow[]}
            getRowId={(r) => r.id}
            renderExpanded={(row) => (
              <div className="flex flex-col gap-1 text-xs text-neutral-700">
                <span className="font-semibold text-neutral-500">감지 기준</span>
                <span>{row.source === "detected" ? "수집 답변 원문에서 새 업체 후보로 감지됨" : "브랜드 설정/별칭 사전에 등록된 업체와 매칭됨"}</span>
                {row.evidenceDomain && (
                  <>
                    <span className="mt-2 font-semibold text-neutral-500">근거 도메인</span>
                    <span className="flex items-center gap-2 text-neutral-600">
                      <FaviconIcon domain={row.evidenceDomain} />
                      {row.evidenceDomain}
                    </span>
                  </>
                )}
                {row.sampleContext && (
                  <>
                    <span className="mt-2 font-semibold text-neutral-500">샘플 문맥</span>
                    <span className="leading-5 text-neutral-600">{row.sampleContext}</span>
                  </>
                )}
              </div>
            )}
          />
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

      {brandContext && (
        <BrandOptimizationModal
          open={brandOptimizationOpen}
          onClose={() => setBrandOptimizationOpen(false)}
          input={{
            own: brandContext.own,
            registered: brandContext.registered,
            candidates: optimizationCandidates.map((row) => ({ name: row.brand, mentions: row.mentions, evidenceDomain: row.evidenceDomain ?? null })),
            evidence: brandContext.evidence,
          }}
          onApply={async (plan: BrandOptimizationPlan) => {
            const evidence = new Map(optimizationCandidates.map((row) => [row.brand.toLocaleLowerCase("ko-KR"), row.evidenceDomain ?? null]));
            const domainOf = (name: string) => evidence.get(name.toLocaleLowerCase("ko-KR")) ?? null;
            const res = await fetch("/api/detected-brand-decisions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "optimized",
                data: {
                  ownAliases: plan.ownAliases,
                  competitors: plan.competitors.map((c) => ({ ...c, evidenceDomain: domainOf(c.name) })),
                  exclude: plan.exclude.map((name) => ({ name, evidenceDomain: domainOf(name) })),
                  roles: plan.roles ?? [],
                  suggestions: plan.suggestions ?? [],
                },
              }),
            });
            if (!res.ok) return (await res.json().catch(() => ({}))).error ?? "브랜드 정리 결과를 저장하지 못했습니다.";
            router.refresh();
            return null;
          }}
        />
      )}

      {registeringSource && (
        <LlmBridgeModal
          open={registeringSource !== null}
          onClose={() => setRegisteringSource(null)}
          title={`${registeringSource.domain} 공략 추천 등록`}
          instructions="AI가 이 소스를 어떻게 공략하면 좋을지 추천과 근거를 작성합니다. 직접 하려면 프롬프트를 복사해 LLM에 물어본 뒤 답변을 붙여넣어 등록할 수도 있습니다."
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

      {groupingOpen && (
        <LlmBridgeModal
          open={groupingOpen}
          onClose={() => setGroupingOpen(false)}
          title="AI로 토픽 묶기"
          instructions="AI가 아래 프롬프트 목록을 토픽 단위로 묶어 줍니다. 다시 실행하면 그룹핑 결과가 갱신됩니다. 직접 하려면 프롬프트를 복사해 LLM에 물어본 뒤 답변을 붙여넣을 수도 있습니다."
          scope="prompt-topic-groups"
          itemKey="current"
          promptText={groupingPromptText}
          parse={(raw) => {
            try {
              const parsed = JSON.parse(raw);
              const isValid =
                Array.isArray(parsed) &&
                parsed.length > 0 &&
                parsed.every(
                  (g) =>
                    typeof g?.topic === "string" &&
                    g.topic.trim() &&
                    Array.isArray(g?.prompts) &&
                    g.prompts.length > 0 &&
                    g.prompts.every((p: unknown) => typeof p === "string" && p.trim())
                );
              if (!isValid) {
                return { error: "topic(문자열)과 prompts(문자열 배열)를 가진 항목의 배열이어야 합니다. JSON 형식을 확인해주세요." };
              }
              return { data: parsed };
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
