"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Check, Copy, Download, GitMerge, Plus, RotateCcw, Settings, Sparkles } from "lucide-react";
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
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import {
  BrandRankRow,
  CitedPageRow,
  CitedSourceRow,
  DateRange,
  TopicCategory,
  TopicRow,
  VisibilityTableRow,
} from "@/lib/db";

const RANGE_WEEKS: Record<DateRange, number> = { "1w": 1, "2w": 2, "4w": 4 };

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "top-prompts": "이미 브랜드가 언급된 토픽의 프롬프트입니다.",
  "topic-opportunities": "아직 브랜드가 언급되지 않은 토픽 기회입니다.",
  "latest-top-brands": "수집된 답변 로그에서 많이 언급된 등록 브랜드와 신규 업체 후보입니다.",
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
  range: DateRange
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

function buildBrandColumns(
  competitorBrandNames: Set<string>,
  onApprove: (row: BrandRankRow) => void,
  onExclude: (row: BrandRankRow, excluded: boolean) => void,
  onRemoveCompetitor: (row: BrandRankRow) => void,
  onMerge: (row: BrandRankRow) => void
): DataTableColumn<BrandRankRow>[] {
  return [
    { key: "brand", label: "브랜드", width: "w-[320px]", render: (r) => <span className="truncate text-neutral-700">{r.brand}</span> },
    { key: "mentions", label: "언급 수", width: "w-[110px]", render: (r) => r.mentions.toLocaleString("ko-KR") },
    {
      key: "action",
      label: "액션",
      width: "w-[220px]",
      render: (r) => {
        const registeredCompetitor = competitorBrandNames.has(r.brand.toLocaleLowerCase("ko-KR"));
        if (r.decisionStatus === "excluded") {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExclude(r, false);
              }}
              className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
            >
              <RotateCcw size={12} />
              제외 해제
            </button>
          );
        }
        if (registeredCompetitor) {
          return (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveCompetitor(r);
                }}
                className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
              >
                <Ban size={12} />
                경쟁사 제외
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMerge(r);
                }}
                className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
              >
                <GitMerge size={12} />
                병합
              </button>
            </div>
          );
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onApprove(r);
              }}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
            >
              <Plus size={12} />
              경쟁사 등록
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExclude(r, true);
              }}
              className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
            >
              <Ban size={12} />
              제외
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMerge(r);
              }}
              className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
            >
              <GitMerge size={12} />
              병합
            </button>
          </div>
        );
      },
    },
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

function formatRunAt(runAt?: string) {
  if (!runAt) return "—";
  const d = new Date(runAt);
  return Number.isNaN(d.getTime()) ? runAt : d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function MergeBrandModal({
  target,
  candidates,
  onClose,
  onMerge,
}: {
  target: BrandRankRow;
  candidates: BrandRankRow[];
  onClose: () => void;
  onMerge: (rows: BrandRankRow[], target: "competitor" | "own") => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set([target.id]));
  const [query, setQuery] = useState("");
  const filteredCandidates = candidates.filter((row) => row.brand.toLocaleLowerCase("ko-KR").includes(query.toLocaleLowerCase("ko-KR").trim()));
  const selectedRows = candidates.filter((row) => selectedIds.has(row.id));
  const canonical = [...selectedRows].sort((a, b) => b.mentions - a.mentions || a.brand.localeCompare(b.brand, "ko-KR"))[0] ?? target;
  const aliases = selectedRows.filter((row) => row.id !== canonical.id).map((row) => row.brand);

  function toggle(row: BrandRankRow) {
    if (row.id === target.id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  return (
    <Modal open onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">브랜드 병합</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">현재 노출된 업체 중 같은 브랜드로 볼 항목을 선택하세요. 언급 수가 가장 높은 항목이 대표 이름이 됩니다.</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="업체 검색"
        className="mt-4 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm text-neutral-800"
      />

      <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
        <span className="font-bold">경쟁사 대표</span>
        <span className="ml-2">{canonical.brand}</span>
        {aliases.length > 0 && <span className="ml-2 text-neutral-500">별칭: {aliases.join(", ")}</span>}
      </div>

      <div className="mt-4 flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
        {filteredCandidates.length === 0 && <p className="rounded-md bg-neutral-50 px-3 py-3 text-xs text-neutral-400">검색 결과가 없습니다.</p>}
        {filteredCandidates.map((row) => {
          const selected = selectedIds.has(row.id);
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => toggle(row)}
              className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                selected ? "bg-slate-100 text-slate-900" : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`grid size-4 place-items-center rounded border ${selected ? "border-slate-800 bg-slate-800" : "border-neutral-300 bg-white"}`}>
                  {selected && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                <span className="truncate">{row.brand}</span>
              </span>
              <span className="shrink-0 text-neutral-500">언급 {row.mentions.toLocaleString("ko-KR")}회</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button variant="secondary" onClick={() => onMerge(selectedRows, "own")} disabled={selectedRows.length < 1}>
          내 브랜드로 등록
        </Button>
        <Button variant="primary" onClick={() => onMerge(selectedRows, "competitor")} disabled={selectedRows.length < 2}>
          경쟁사로 병합
        </Button>
      </div>
    </Modal>
  );
}

function BrandOptimizationBridgeModal({
  rows,
  onClose,
  onSaved,
}: {
  rows: BrandRankRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptText = `다음은 AI 답변 수집 로그에서 발견된 업체 후보 목록입니다. 실제 브랜드/업체만 정리해주세요.

규칙:
- 우리 브랜드의 다른 표기라고 판단되는 항목은 ownAliases에 넣으세요.
- 같은 경쟁사의 다른 표기는 competitors에 대표 name과 aliases로 묶으세요.
- 업체명이 아니라 일반 개념어/부서명/기능명/분야명은 exclude에 넣으세요.
- 목록에 없는 새 이름은 만들지 마세요.
- 반드시 JSON 하나만 답하세요.

응답 형식:
{
  "ownAliases": ["우리 브랜드의 다른 표기"],
  "competitors": [{"name": "대표 경쟁사명", "aliases": ["다른 표기"]}],
  "exclude": [{"name": "제외할 후보명"}]
}

후보 목록:
${rows.map((row) => `- ${row.brand} | 언급 ${row.mentions}회${row.evidenceDomain ? ` | 근거 도메인 ${row.evidenceDomain}` : ""}`).join("\n")}`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(pasted);
    } catch {
      setError("JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("JSON 객체 형식이어야 합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/detected-brand-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "optimized", data: parsed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "브랜드 최적화 결과를 저장하지 못했습니다.");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-neutral-900">브랜드 최적화</h2>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">현재 노출된 업체 후보를 LLM으로 정리해 내 브랜드 별칭, 경쟁사 병합, 제외 상태에 반영합니다.</p>

      <div className="mt-4 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-neutral-700">1. 프롬프트 복사</span>
          <button
            type="button"
            onClick={copyPrompt}
            className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <textarea readOnly value={promptText} rows={8} className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600" />
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs font-bold text-neutral-700">2. LLM 답변 붙여넣기</span>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={8}
          placeholder="JSON 답변을 붙여넣으세요"
          className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
        />
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "저장 중..." : "결과 반영"}
        </Button>
      </div>
    </Modal>
  );
}

function allKeys(family: Family) {
  return new Set(OPTIONAL_COLUMNS[family].map((c) => c.key));
}

export function TopicsTableSection({
  categories,
  topicsByCategory,
  competitorBrandNames,
  range,
}: {
  categories: TopicCategory[];
  topicsByCategory: Record<string, VisibilityTableRow[]>;
  competitorBrandNames: string[];
  /** 토픽 표 자체는 range와 무관한 전체 기간 집계지만, "추이" 스파크라인만
   *  이 값만큼의 최근 주차로 잘라서 보여준다. */
  range: DateRange;
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
  const [groupingOpen, setGroupingOpen] = useState(false);
  const [includeExcludedBrands, setIncludeExcludedBrands] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<BrandRankRow | null>(null);
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
    router.push("/prompt-library");
  }
  const [visibleByFamily, setVisibleByFamily] = useState<Record<Family, Set<string>>>({
    topic: allKeys("topic"),
    brand: allKeys("brand"),
    page: allKeys("page"),
    source: allKeys("source"),
  });

  const category = categories.find((c) => c.id === categoryId);
  const allRows = useMemo(() => {
    const sourceRows = topicsByCategory[categoryId] ?? [];
    if (categoryId !== "latest-top-brands" || includeExcludedBrands) return sourceRows;
    return sourceRows.filter((row) => !("brand" in row) || row.decisionStatus !== "excluded");
  }, [topicsByCategory, categoryId, includeExcludedBrands]);
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
        range
      ),
    [trackedIds, isTopicOpportunities, range]
  );
  const visibleTopicColumns = topicColumns.filter((c) => !["mentions", "visibility", "market"].includes(c.key) || visible.has(c.key));
  const competitorBrandNameSet = useMemo(() => new Set(competitorBrandNames.map((name) => name.toLocaleLowerCase("ko-KR"))), [competitorBrandNames]);
  const setBrandDecision = useCallback(async (row: BrandRankRow, status: "approved" | "excluded" | "competitor_removed" | null) => {
    const res = await fetch("/api/detected-brand-decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: row.brand, evidenceDomain: row.evidenceDomain, status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? "브랜드 상태를 저장하지 못했습니다.");
      return;
    }
    router.refresh();
  }, [router]);
  const brandRows = useMemo(() => allRows.filter((row): row is BrandRankRow => "brand" in row), [allRows]);
  const mergeCandidates = useMemo(() => brandRows.filter((row) => row.decisionStatus !== "excluded"), [brandRows]);
  async function mergeBrands(selectedRows: BrandRankRow[], mergeTarget: "competitor" | "own") {
    const res = await fetch("/api/detected-brand-decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "merged",
        mergeTarget,
        brands: selectedRows.map((row) => ({ name: row.brand, mentions: row.mentions, evidenceDomain: row.evidenceDomain })),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? "브랜드를 병합하지 못했습니다.");
      return;
    }
    setMergeTarget(null);
    router.refresh();
  }
  const brandColumns = useMemo(
    () =>
      buildBrandColumns(
        competitorBrandNameSet,
        (row) => setBrandDecision(row, "approved"),
        (row, excluded) => setBrandDecision(row, excluded ? "excluded" : null),
        (row) => setBrandDecision(row, "competitor_removed"),
        (row) => setMergeTarget(row)
      ),
    [competitorBrandNameSet, setBrandDecision]
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
        {isBrandFamily && mergeCandidates.length > 0 && (
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

      {isBrandFamily && (
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-xs font-medium text-neutral-500">제외 포함 전체 보기</span>
          <button
            type="button"
            role="switch"
            aria-checked={includeExcludedBrands}
            onClick={() => setIncludeExcludedBrands((v) => !v)}
            className={`flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
              includeExcludedBrands ? "justify-end bg-slate-800" : "justify-start bg-neutral-300"
            }`}
          >
            <span className="size-4 rounded-full bg-white" />
          </button>
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

      {mergeTarget && (
        <MergeBrandModal
          target={mergeTarget}
          candidates={mergeCandidates}
          onClose={() => setMergeTarget(null)}
          onMerge={mergeBrands}
        />
      )}

      {brandOptimizationOpen && (
        <BrandOptimizationBridgeModal
          rows={mergeCandidates}
          onClose={() => setBrandOptimizationOpen(false)}
          onSaved={() => {
            setBrandOptimizationOpen(false);
            router.refresh();
          }}
        />
      )}

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

      {groupingOpen && (
        <LlmBridgeModal
          open={groupingOpen}
          onClose={() => setGroupingOpen(false)}
          title="AI로 토픽 묶기"
          instructions="LLM API 연동 전까지, 아래 프롬프트 목록을 LLM에게 그대로 물어본 뒤 답변을 붙여넣으면 프롬프트들이 토픽 단위로 묶여 보입니다. 다시 실행하면 그룹핑 결과가 갱신됩니다."
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
