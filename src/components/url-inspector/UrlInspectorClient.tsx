"use client";

import { EditOnly } from "@/components/auth/PermissionsProvider";

import { CitationFeaturesCard } from "@/components/url-inspector/CitationFeaturesCard";
import type { CitationFeatureAnalysis } from "@/lib/citationFeatures";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { TablePanel } from "@/components/ui/TablePanel";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { TABLE_PAGE_SIZES, type TablePage } from "@/lib/serverPaging";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { CitedDomainRow, CitedPromptRun, OwnCitedUrlRow, ThirdPartyUrlRow } from "@/lib/db";
import { formatRunAt } from "@/lib/formatRunAt";

const MARKET_OPTIONS = ["전체", "KR", "US", "GLOBAL"];
const CATEGORY_OPTIONS = ["전체", "마케팅", "브랜드", "여행"];

// 원본 URL 그대로 새 탭에서 열리게 하되, 화면엔 길이를 줄여서 보여준다 —
// 실제 링크는 그대로 유지해야 클릭 시 정확히 같은 URL로 들어간다.
function truncateUrl(url: string, max = 60) {
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

function UrlLink({ url }: { url: string }) {
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="min-w-0 truncate text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {truncateUrl(url)}
    </a>
  );
}

// 행을 펼치면 이 URL을 인용한 프롬프트를 실행일·모델·마켓과 함께 보여 준다 — 가시성 개요의 확장형 표와 같은 모양.
// 실측 데이터가 없는 행(목업)은 프롬프트 제목만 보여 준다.
function CitedPromptsExpanded({ row }: { row: { url: string; lazyDetail?: boolean; citedPromptRuns?: CitedPromptRun[]; citedPromptTitles: string[] } }) {
  const [loaded, setLoaded] = useState<{ runs?: CitedPromptRun[]; error?: boolean } | null>(null);

  // 실측 행은 프롬프트 목록을 싣지 않고 펼칠 때 불러온다(payload 절약).
  useEffect(() => {
    if (!row.lazyDetail) return;
    let cancelled = false;
    fetch(`/api/url-inspector/citations?url=${encodeURIComponent(row.url)}`)
      .then(async (res) => (res.ok ? { runs: (await res.json()) as CitedPromptRun[] } : { error: true }))
      .catch(() => ({ error: true }))
      .then((result) => {
        if (!cancelled) setLoaded(result);
      });
    return () => {
      cancelled = true;
    };
  }, [row.lazyDetail, row.url]);

  if (row.lazyDetail && !loaded) return <p className="text-xs text-neutral-400">불러오는 중…</p>;
  if (row.lazyDetail && loaded?.error) return <p className="text-xs text-red-600">프롬프트 목록을 불러오지 못했습니다.</p>;
  const runs = row.lazyDetail ? loaded?.runs : row.citedPromptRuns;
  const rows: CitedPromptRun[] = runs ?? row.citedPromptTitles.map((prompt) => ({ prompt, runAt: "", model: "", market: "" }));
  if (rows.length === 0) return <p className="text-xs text-neutral-400">아직 이 URL을 인용한 프롬프트가 없습니다.</p>;
  const detailed = rows.some((r) => r.runAt);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 border-b border-neutral-100 pb-2 text-xs font-bold text-neutral-500">
        <span className="min-w-0 flex-1">프롬프트</span>
        {detailed && (
          <>
            <span className="w-[70px] shrink-0">실행일</span>
            <span className="w-[110px] shrink-0">모델</span>
            <span className="w-[70px] shrink-0">마켓</span>
          </>
        )}
      </div>
      {rows.map((run, i) => (
        <div key={`${run.prompt}-${run.runAt}-${i}`} className="flex items-center gap-3 text-xs text-neutral-700">
          <span className="min-w-0 flex-1 truncate" title={run.prompt}>
            {run.prompt}
          </span>
          {detailed && (
            <>
              <span className="w-[70px] shrink-0 text-neutral-500">{formatRunAt(run.runAt)}</span>
              <span className="w-[110px] shrink-0">{run.model}</span>
              <span className="w-[70px] shrink-0">
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{run.market}</span>
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function buildOwnColumns(onUnregister: (row: OwnCitedUrlRow) => void): DataTableColumn<OwnCitedUrlRow>[] {
  return [
    {
      key: "url",
      label: "URL",
      render: (r) => (
        <div className="flex items-center gap-2">
          <UrlLink url={r.url} />
          {r.id.startsWith("registered-") && (
            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              등록됨 · 아직 인용 안 됨
            </span>
          )}
        </div>
      ),
    },
    { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
    { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
    { key: "contentVisibility", label: "콘텐츠 가시성", width: "w-[110px]", render: (r) => (r.contentVisibility === null ? "—" : `${r.contentVisibility}%`) },
    { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => r.category },
    { key: "market", label: "마켓", width: "w-[80px]", render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span> },
    {
      key: "action",
      label: "",
      width: "w-[90px]",
      render: (r) =>
        r.id.startsWith("registered-") ? (
          <EditOnly>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUnregister(r);
              }}
              className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50 cursor-pointer"
            >
              등록 해제
            </button>
          </EditOnly>
        ) : null,
    },
  ];
}
const ownOptional: ColumnOption[] = [
  { key: "citations", label: "인용 횟수" },
  { key: "citedPrompts", label: "인용된 프롬프트 수" },
  { key: "contentVisibility", label: "콘텐츠 가시성" },
  { key: "category", label: "카테고리" },
  { key: "market", label: "마켓" },
];

function buildThirdPartyColumns(): DataTableColumn<ThirdPartyUrlRow>[] {
  return [
    { key: "url", label: "URL", render: (r) => <UrlLink url={r.url} /> },
    { key: "contentType", label: "콘텐츠 유형", width: "w-[100px]", render: (r) => r.contentType },
    { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
    { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
    { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => r.category },
    { key: "market", label: "마켓", width: "w-[80px]", render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span> },
  ];
}
const thirdPartyOptional: ColumnOption[] = [
  { key: "contentType", label: "콘텐츠 유형" },
  { key: "citations", label: "인용 횟수" },
  { key: "citedPrompts", label: "인용된 프롬프트 수" },
  { key: "category", label: "카테고리" },
  { key: "market", label: "마켓" },
];

const domainColumns: DataTableColumn<CitedDomainRow>[] = [
  { key: "domain", label: "도메인", render: (r) => <span className="text-neutral-800">{r.domain}</span> },
  { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
  { key: "uniqueUrls", label: "고유 URL 수", width: "w-[100px]", render: (r) => r.uniqueUrls },
  { key: "citationsPerUrl", label: "URL당 인용 수", width: "w-[110px]", render: (r) => r.citationsPerUrl.toFixed(1) },
  { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
  { key: "contentType", label: "콘텐츠 유형", width: "w-[100px]", render: (r) => r.contentType },
];
const domainOptional: ColumnOption[] = [
  { key: "citations", label: "인용 횟수" },
  { key: "uniqueUrls", label: "고유 URL 수" },
  { key: "citationsPerUrl", label: "URL당 인용 수" },
  { key: "citedPrompts", label: "인용된 프롬프트 수" },
  { key: "contentType", label: "콘텐츠 유형" },
];

// 표 하나의 페이지·크기·검색을 주소(쿼리)로 다루는 훅 — 검색은 입력을 멈추면(0.35초) 서버로 보낸다.
function useUrlTable(prefix: string, serverSearch: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchText, setSearchText] = useState(serverSearch);

  const navigate = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (searchText.trim() === serverSearch) return;
    const timer = setTimeout(() => navigate({ [`${prefix}Q`]: searchText.trim() || null, [`${prefix}Page`]: null }), 350);
    return () => clearTimeout(timer);
    // 입력값이 바뀔 때만 다시 예약한다(navigate는 렌더마다 새로 만들어질 수 있다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  return {
    navigate,
    searchText,
    setSearchText,
    onPageChange: (page: number) => navigate({ [`${prefix}Page`]: page === 1 ? null : String(page) }),
    onPageSizeChange: (size: number) => navigate({ [`${prefix}Size`]: String(size), [`${prefix}Page`]: null }),
  };
}

export function UrlInspectorClient({
  stats,
  market,
  category,
  own: ownPage,
  thirdParty: thirdPartyPage,
  domains: domainPage,
  featureAnalysis,
}: {
  stats: { ownCitedPrompts: number; totalCitedPrompts: number; uniqueCitedUrls: number; totalCitations: number };
  market: string;
  category: string;
  own: TablePage<OwnCitedUrlRow>;
  thirdParty: TablePage<ThirdPartyUrlRow>;
  domains: TablePage<CitedDomainRow>;
  featureAnalysis?: CitationFeatureAnalysis | null;
}) {
  const router = useRouter();
  const ownTable = useUrlTable("own", ownPage.search);
  const thirdPartyTable = useUrlTable("tp", thirdPartyPage.search);
  const domainTable = useUrlTable("dom", domainPage.search);
  const [newUrl, setNewUrl] = useState("");
  const [registering, setRegistering] = useState(false);

  async function registerNewUrl() {
    const url = newUrl.trim();
    if (!url) return;
    setRegistering(true);
    await fetch("/api/registered-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setNewUrl("");
    setRegistering(false);
    router.refresh();
  }

  const unregisterUrl = useCallback(
    async (url: string) => {
      await fetch("/api/registered-urls", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      router.refresh();
    },
    [router]
  );

  const ownColumns = useMemo(
    () => buildOwnColumns((r) => unregisterUrl(r.url)),
    [unregisterUrl]
  );
  const thirdPartyColumns = useMemo(
    () => buildThirdPartyColumns(),
    []
  );

  const own = useColumnVisibility(ownColumns, ownOptional);
  const thirdParty = useColumnVisibility(thirdPartyColumns, thirdPartyOptional);
  const domain = useColumnVisibility(domainColumns, domainOptional);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">URL 인스펙터</h1>
        <p className="mt-1 text-sm text-neutral-500">URL 가시성과 AI 답변 인용 데이터를 분석하세요.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Dropdown variant="solid" label="마켓" value={market} options={MARKET_OPTIONS} onChange={(v) => ownTable.navigate({ market: v === "전체" ? null : v, ownPage: null, tpPage: null })} />
        <Dropdown variant="solid" label="카테고리" value={category} options={CATEGORY_OPTIONS} onChange={(v) => ownTable.navigate({ category: v === "전체" ? null : v, ownPage: null, tpPage: null })} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SimpleStatCard label="자사 인용 고유 프롬프트 수" value={stats.ownCitedPrompts} />
        <SimpleStatCard label="전체 고유 프롬프트 수" value={stats.totalCitedPrompts} />
        <SimpleStatCard label="고유 인용 URL 수" value={stats.uniqueCitedUrls} />
        <SimpleStatCard label="총 인용 횟수" value={stats.totalCitations} />
      </div>

      {featureAnalysis && <CitationFeaturesCard analysis={featureAnalysis} />}

      <TablePanel
        title="자사 인용 URL"
        description="AI 답변에 인용된 우리 사이트 URL입니다. 아직 인용 안 됐어도 추적하고 싶은 새 콘텐츠는 직접 등록해두세요."
        count={ownPage.filteredTotal}
        total={ownPage.total}
        onConfigureColumns={() => own.setOpen(true)}
        searchValue={ownTable.searchText}
        onSearchChange={ownTable.setSearchText}
        searchPlaceholder="URL 검색"
      >
        <EditOnly>
          <div className="mb-3 flex items-center gap-2">
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && registerNewUrl()}
              placeholder="https://... — 추적할 URL 등록"
              className="h-9 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
            />
            <button
              type="button"
              disabled={registering || !newUrl.trim()}
              onClick={registerNewUrl}
              className="h-9 shrink-0 rounded-md bg-slate-800 px-3 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              등록
            </button>
          </div>
        </EditOnly>
        <DataTable
          columns={own.filtered}
          rows={ownPage.rows}
          getRowId={(r) => r.id}
          renderExpanded={(r) => <CitedPromptsExpanded row={r} />}
        />
        <div className="mt-3">
          <Pagination
            page={ownPage.page}
            pageCount={ownPage.pageCount}
            pageSize={ownPage.pageSize}
            totalCount={ownPage.filteredTotal}
            pageSizeOptions={TABLE_PAGE_SIZES}
            onPageChange={ownTable.onPageChange}
            onPageSizeChange={ownTable.onPageSizeChange}
          />
        </div>
        <ConfigureColumnsModal open={own.open} onClose={() => own.setOpen(false)} columns={ownOptional} visible={own.visible} onApply={own.setVisible} />
      </TablePanel>

      <TablePanel
        title="인용된 제3자 URL"
        description="AI 답변에 인용된 제3자 사이트 URL입니다."
        count={thirdPartyPage.filteredTotal}
        total={thirdPartyPage.total}
        onConfigureColumns={() => thirdParty.setOpen(true)}
        searchValue={thirdPartyTable.searchText}
        onSearchChange={thirdPartyTable.setSearchText}
        searchPlaceholder="URL 검색"
      >
        <DataTable
          columns={thirdParty.filtered}
          rows={thirdPartyPage.rows}
          getRowId={(r) => r.id}
          renderExpanded={(r) => <CitedPromptsExpanded row={r} />}
        />
        <div className="mt-3">
          <Pagination
            page={thirdPartyPage.page}
            pageCount={thirdPartyPage.pageCount}
            pageSize={thirdPartyPage.pageSize}
            totalCount={thirdPartyPage.filteredTotal}
            pageSizeOptions={TABLE_PAGE_SIZES}
            onPageChange={thirdPartyTable.onPageChange}
            onPageSizeChange={thirdPartyTable.onPageSizeChange}
          />
        </div>
        <ConfigureColumnsModal
          open={thirdParty.open}
          onClose={() => thirdParty.setOpen(false)}
          columns={thirdPartyOptional}
          visible={thirdParty.visible}
          onApply={thirdParty.setVisible}
        />
      </TablePanel>

      <TablePanel
        title="인용된 도메인"
        description="AI 답변이 가장 많이 인용한 도메인입니다."
        count={domainPage.filteredTotal}
        total={domainPage.total}
        onConfigureColumns={() => domain.setOpen(true)}
        searchValue={domainTable.searchText}
        onSearchChange={domainTable.setSearchText}
        searchPlaceholder="도메인 검색"
      >
        <DataTable columns={domain.filtered} rows={domainPage.rows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination
            page={domainPage.page}
            pageCount={domainPage.pageCount}
            pageSize={domainPage.pageSize}
            totalCount={domainPage.filteredTotal}
            pageSizeOptions={TABLE_PAGE_SIZES}
            onPageChange={domainTable.onPageChange}
            onPageSizeChange={domainTable.onPageSizeChange}
          />
        </div>
        <ConfigureColumnsModal open={domain.open} onClose={() => domain.setOpen(false)} columns={domainOptional} visible={domain.visible} onApply={domain.setVisible} />
      </TablePanel>
    </div>
  );
}
