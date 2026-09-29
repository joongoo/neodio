"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { Tabs } from "@/components/ui/Tabs";
import type { BrandMentionWeek } from "@/lib/backend/collectionStatsReader";
import { AGE_BUCKETS, defaultDateRange, fillPeriods, TrendResult, TrendTimeUnit } from "@/lib/searchTrend";
import { fetchTrend, TrendGroupInput, TrendQuery } from "./trendApi";
import { TrendKeywordCleanupModal } from "./TrendKeywordCleanupModal";
import { TrendLlmCrossTab } from "./TrendLlmCrossTab";
import { TrendOverviewTab } from "./TrendOverviewTab";
import { TrendSegmentsTab } from "./TrendSegmentsTab";

const MAX_GROUPS = 5;
const MAX_KEYWORDS = 20;
const MIN_DATE = "2016-01-01";
const TIME_UNITS: { value: TrendTimeUnit; label: string }[] = [
  { value: "date", label: "일간" },
  { value: "week", label: "주간" },
  { value: "month", label: "월간" },
];

interface GroupDraft {
  name: string;
  keywords: string;
}

const toDraft = (g: TrendGroupInput): GroupDraft => ({ name: g.groupName, keywords: g.keywords.join(", ") });

export function SearchTrendClient({
  configured,
  initialGroups,
  groupsSource,
  initialQuery,
  initialResult,
  initialError,
  mentionWeeks,
}: {
  configured: boolean;
  initialGroups: TrendGroupInput[];
  /** 기본 주제어 그룹을 어떤 기준으로 채웠는지 — 폼 위에 한 줄로 알린다. */
  groupsSource: string;
  initialQuery: Pick<TrendQuery, "startDate" | "endDate" | "timeUnit">;
  initialResult: TrendResult | null;
  initialError: string | null;
  mentionWeeks: BrandMentionWeek[] | null;
}) {
  const [drafts, setDrafts] = useState<GroupDraft[]>(initialGroups.length ? initialGroups.map(toDraft) : [{ name: "", keywords: "" }]);
  const [range, setRange] = useState({ startDate: initialQuery.startDate, endDate: initialQuery.endDate });
  const [timeUnit, setTimeUnit] = useState<TrendTimeUnit>(initialQuery.timeUnit);
  const [device, setDevice] = useState<"" | "pc" | "mo">("");
  const [gender, setGender] = useState<"" | "m" | "f">("");
  const [ageIds, setAgeIds] = useState<string[]>([]);

  // 화면에 보이는 결과를 만든 조건 — 입력 폼을 고치는 중에도 다른 탭은 이 조건을 기준으로 동작한다.
  const [applied, setApplied] = useState<TrendQuery | null>(
    initialResult ? { ...initialQuery, keywordGroups: initialGroups } : null
  );
  const [result, setResult] = useState<TrendResult | null>(initialResult ? fillPeriods(initialResult) : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [tab, setTab] = useState("overview");
  const [cleanupGroups, setCleanupGroups] = useState<TrendGroupInput[] | null>(null);

  function parseGroups(): TrendGroupInput[] | string {
    const groups = drafts
      .map((d) => ({
        groupName: d.name.trim(),
        keywords: Array.from(new Set(d.keywords.split(",").map((k) => k.trim()).filter(Boolean))),
      }))
      .filter((g) => g.groupName || g.keywords.length);
    if (groups.length === 0) return "주제어와 검색어를 입력하세요.";
    for (const g of groups) {
      if (!g.groupName) return "주제어 이름이 비어 있는 그룹이 있습니다.";
      if (g.keywords.length === 0) return `"${g.groupName}"의 검색어를 입력하세요.`;
      if (g.keywords.length > MAX_KEYWORDS) return `"${g.groupName}"의 검색어는 최대 ${MAX_KEYWORDS}개입니다.`;
    }
    if (new Set(groups.map((g) => g.groupName)).size !== groups.length) return "주제어 이름이 겹칩니다.";
    return groups;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const groups = parseGroups();
    if (typeof groups === "string") return setError(groups);
    if (range.startDate < MIN_DATE) return setError("조회 시작일은 2016-01-01 이후여야 합니다.");
    if (range.endDate < range.startDate) return setError("종료일이 시작일보다 빠릅니다.");

    const query: TrendQuery = {
      ...range,
      timeUnit,
      keywordGroups: groups,
      device: device || undefined,
      gender: gender || undefined,
      ages: ageIds.length ? AGE_BUCKETS.filter((a) => ageIds.includes(a.id)).flatMap((a) => [...a.codes]) : undefined,
    };
    setLoading(true);
    setError(null);
    const res = await fetchTrend(query);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setResult(fillPeriods(res.result));
    setApplied(query);
  }

  function openCleanup() {
    const groups = parseGroups();
    if (typeof groups === "string") return setError(groups);
    setError(null);
    setCleanupGroups(groups);
  }

  function applyCleanup(result: Record<string, string[]>) {
    setDrafts((list) => list.map((d) => (result[d.name.trim()] ? { ...d, keywords: result[d.name.trim()].join(", ") } : d)));
  }

  function changeUnit(unit: TrendTimeUnit) {
    setTimeUnit(unit);
    setRange(defaultDateRange(unit));
  }

  const updateDraft = (i: number, patch: Partial<GroupDraft>) => setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const tabs = useMemo(
    () => [
      { id: "overview", label: "추이 개요" },
      { id: "segments", label: "기기·성별·연령" },
      { id: "llm", label: "AI 답변 교차" },
    ],
    []
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">검색어 트렌드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          네이버 데이터랩 통합 검색어 트렌드 기준으로 주제어별 검색 관심도를 비교하고, 수집된 AI 답변의 브랜드 언급과 겹쳐 봅니다.
        </p>
      </div>

      {!configured && (
        <InfoBanner
          title="네이버 API 키가 필요합니다"
          description="서버 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET(NAVER API HUB에서 발급)을 설정하면 조회할 수 있습니다."
        />
      )}

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-neutral-500">주제어 그룹 (최대 {MAX_GROUPS}개 · 서로 비교할 대상은 한 번에 함께 조회하세요)</p>
          <p className="text-xs text-neutral-400">기본값 기준: {groupsSource}</p>
          {drafts.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`주제어 ${i + 1}`}
                value={d.name}
                onChange={(e) => updateDraft(i, { name: e.target.value })}
                placeholder="주제어 (예: 네오다임)"
                className="h-10 w-[180px] shrink-0 rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
              />
              <input
                aria-label={`검색어 ${i + 1}`}
                value={d.keywords}
                onChange={(e) => updateDraft(i, { keywords: e.target.value })}
                placeholder="검색어를 쉼표로 구분 (예: 네오다임, Neodigm)"
                className="h-10 min-w-0 flex-1 rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
              />
              <button
                type="button"
                aria-label="그룹 삭제"
                disabled={drafts.length === 1}
                onClick={() => setDrafts((list) => list.filter((_, j) => j !== i))}
                className="rounded-md p-2 text-neutral-500 cursor-pointer hover:bg-neutral-100 disabled:opacity-30"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-4">
            {drafts.length < MAX_GROUPS && (
              <button type="button" onClick={() => setDrafts((list) => [...list, { name: "", keywords: "" }])} className="flex w-fit items-center gap-1 text-xs font-medium text-slate-700 cursor-pointer hover:opacity-70">
                <Plus size={14} />
                그룹 추가
              </button>
            )}
            <button type="button" onClick={openCleanup} className="flex w-fit items-center gap-1 text-xs font-medium text-slate-700 cursor-pointer hover:opacity-70">
              <Sparkles size={14} />
              AI로 검색어 정리
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="단위">
            <select value={timeUnit} onChange={(e) => changeUnit(e.target.value as TrendTimeUnit)} className={SELECT}>
              {TIME_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="시작일">
            <input type="date" min={MIN_DATE} value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} className={SELECT} />
          </Field>
          <Field label="종료일">
            <input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} className={SELECT} />
          </Field>
          <Field label="기기">
            <select value={device} onChange={(e) => setDevice(e.target.value as typeof device)} className={SELECT}>
              <option value="">전체</option>
              <option value="pc">PC</option>
              <option value="mo">모바일</option>
            </select>
          </Field>
          <Field label="성별">
            <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} className={SELECT}>
              <option value="">전체</option>
              <option value="m">남성</option>
              <option value="f">여성</option>
            </select>
          </Field>
          <button type="submit" disabled={loading || !configured} className="h-10 rounded-md bg-slate-800 px-5 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:opacity-50">
            {loading ? "조회 중…" : "조회"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-neutral-500">연령</span>
          {AGE_BUCKETS.map((a) => {
            const on = ageIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => setAgeIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                className={`rounded-full px-3 py-1 text-xs font-medium cursor-pointer ${on ? "bg-slate-800 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
              >
                {a.label}
              </button>
            );
          })}
          <span className="ml-1 text-xs text-neutral-400">{ageIds.length ? "" : "선택 없음 = 전체"}</span>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {!result || !applied ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700">조회한 데이터가 없습니다</p>
          <p className="text-xs text-neutral-500">주제어와 검색어를 입력하고 조회하세요.</p>
        </Card>
      ) : (
        <>
          {tab === "overview" && <TrendOverviewTab result={result} />}
          {tab === "segments" && (
            <TrendSegmentsTab base={{ startDate: applied.startDate, endDate: applied.endDate, timeUnit: applied.timeUnit }} groups={applied.keywordGroups} />
          )}
          {tab === "llm" && <TrendLlmCrossTab groups={applied.keywordGroups} mentionWeeks={mentionWeeks} base={{ device: applied.device, gender: applied.gender, ages: applied.ages }} />}
        </>
      )}
      <TrendKeywordCleanupModal
        open={cleanupGroups !== null}
        onClose={() => setCleanupGroups(null)}
        groups={cleanupGroups ?? []}
        onApply={applyCleanup}
      />
    </div>
  );
}

const SELECT = "h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-800 outline-none focus:border-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
