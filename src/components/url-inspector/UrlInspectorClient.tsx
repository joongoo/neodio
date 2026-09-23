"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { TablePanel } from "@/components/ui/TablePanel";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { CitedDomainRow, OwnCitedUrlRow, ThirdPartyUrlRow, UrlInspectorData } from "@/lib/db";

const MARKET_OPTIONS = ["전체", "KR", "US", "GLOBAL"];
const CATEGORY_OPTIONS = ["전체", "마케팅", "브랜드", "여행"];
const PAGE_SIZE = 10;

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
      className="truncate text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {truncateUrl(url)}
    </a>
  );
}

function DetailButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50 cursor-pointer"
    >
      상세
    </button>
  );
}

function buildOwnColumns(
  onDetail: (row: OwnCitedUrlRow) => void,
  onUnregister: (row: OwnCitedUrlRow) => void
): DataTableColumn<OwnCitedUrlRow>[] {
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
      key: "detail",
      label: "",
      width: "w-[120px]",
      render: (r) =>
        r.id.startsWith("registered-") ? (
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
        ) : (
          <DetailButton onClick={() => onDetail(r)} />
        ),
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

function buildThirdPartyColumns(onDetail: (row: ThirdPartyUrlRow) => void): DataTableColumn<ThirdPartyUrlRow>[] {
  return [
    { key: "url", label: "URL", render: (r) => <UrlLink url={r.url} /> },
    { key: "contentType", label: "콘텐츠 유형", width: "w-[100px]", render: (r) => r.contentType },
    { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
    { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
    { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => r.category },
    { key: "market", label: "마켓", width: "w-[80px]", render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span> },
    { key: "detail", label: "", width: "w-[64px]", render: (r) => <DetailButton onClick={() => onDetail(r)} /> },
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

function usePagedRows<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [rows, clampedPage, pageSize]
  );
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };
  return { page: clampedPage, setPage, pageCount, pageRows, pageSize, setPageSize: changePageSize };
}

export function UrlInspectorClient({ data }: { data: UrlInspectorData }) {
  const router = useRouter();
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [ownSearch, setOwnSearch] = useState("");
  const [thirdPartySearch, setThirdPartySearch] = useState("");
  const [domainSearch, setDomainSearch] = useState("");
  const [detailRow, setDetailRow] = useState<{ url: string; prompts: string[] } | null>(null);
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

  const ownRowsBase = data.ownUrls.filter((r) => (market === "전체" || r.market === market) && (category === "전체" || r.category === category));
  const thirdPartyRowsBase = data.thirdPartyUrls.filter((r) => (market === "전체" || r.market === market) && (category === "전체" || r.category === category));
  const ownRows = ownRowsBase.filter((r) => r.url.toLowerCase().includes(ownSearch.trim().toLowerCase()));
  const thirdPartyRows = thirdPartyRowsBase.filter((r) => r.url.toLowerCase().includes(thirdPartySearch.trim().toLowerCase()));
  const domainRows = data.citedDomains.filter((r) => r.domain.toLowerCase().includes(domainSearch.trim().toLowerCase()));

  const ownColumns = useMemo(
    () =>
      buildOwnColumns(
        (r) => setDetailRow({ url: r.url, prompts: r.citedPromptTitles }),
        (r) => unregisterUrl(r.url)
      ),
    [unregisterUrl]
  );
  const thirdPartyColumns = useMemo(
    () => buildThirdPartyColumns((r) => setDetailRow({ url: r.url, prompts: r.citedPromptTitles })),
    []
  );

  const own = useColumnVisibility(ownColumns, ownOptional);
  const thirdParty = useColumnVisibility(thirdPartyColumns, thirdPartyOptional);
  const domain = useColumnVisibility(domainColumns, domainOptional);

  const ownPaged = usePagedRows(ownRows);
  const thirdPartyPaged = usePagedRows(thirdPartyRows);
  const domainPaged = usePagedRows(domainRows);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">URL 인스펙터</h1>
        <p className="mt-1 text-sm text-neutral-500">URL 가시성과 AI 답변 인용 데이터를 분석하세요.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Dropdown variant="solid" label="마켓" value={market} options={MARKET_OPTIONS} onChange={setMarket} />
        <Dropdown variant="solid" label="카테고리" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SimpleStatCard label="자사 인용 고유 프롬프트 수" value={data.ownCitedPrompts} />
        <SimpleStatCard label="전체 고유 프롬프트 수" value={data.totalCitedPrompts} />
        <SimpleStatCard label="고유 인용 URL 수" value={data.uniqueCitedUrls} />
        <SimpleStatCard label="총 인용 횟수" value={data.totalCitations} />
      </div>

      <TablePanel
        title="자사 인용 URL"
        description="AI 답변에 인용된 우리 사이트 URL입니다. 아직 인용 안 됐어도 추적하고 싶은 새 콘텐츠는 직접 등록해두세요."
        count={ownRows.length}
        total={ownRowsBase.length}
        onConfigureColumns={() => own.setOpen(true)}
        searchValue={ownSearch}
        onSearchChange={setOwnSearch}
        searchPlaceholder="URL 검색"
      >
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
        <DataTable columns={own.filtered} rows={ownPaged.pageRows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination
            page={ownPaged.page}
            pageCount={ownPaged.pageCount}
            pageSize={ownPaged.pageSize}
            totalCount={ownRows.length}
            onPageChange={ownPaged.setPage}
            onPageSizeChange={ownPaged.setPageSize}
          />
        </div>
        <ConfigureColumnsModal open={own.open} onClose={() => own.setOpen(false)} columns={ownOptional} visible={own.visible} onApply={own.setVisible} />
      </TablePanel>

      <TablePanel
        title="인용된 제3자 URL"
        description="AI 답변에 인용된 제3자 사이트 URL입니다."
        count={thirdPartyRows.length}
        total={thirdPartyRowsBase.length}
        onConfigureColumns={() => thirdParty.setOpen(true)}
        searchValue={thirdPartySearch}
        onSearchChange={setThirdPartySearch}
        searchPlaceholder="URL 검색"
      >
        <DataTable columns={thirdParty.filtered} rows={thirdPartyPaged.pageRows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination
            page={thirdPartyPaged.page}
            pageCount={thirdPartyPaged.pageCount}
            pageSize={thirdPartyPaged.pageSize}
            totalCount={thirdPartyRows.length}
            onPageChange={thirdPartyPaged.setPage}
            onPageSizeChange={thirdPartyPaged.setPageSize}
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
        count={domainRows.length}
        total={data.citedDomains.length}
        onConfigureColumns={() => domain.setOpen(true)}
        searchValue={domainSearch}
        onSearchChange={setDomainSearch}
        searchPlaceholder="도메인 검색"
      >
        <DataTable columns={domain.filtered} rows={domainPaged.pageRows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination
            page={domainPaged.page}
            pageCount={domainPaged.pageCount}
            pageSize={domainPaged.pageSize}
            totalCount={domainRows.length}
            onPageChange={domainPaged.setPage}
            onPageSizeChange={domainPaged.setPageSize}
          />
        </div>
        <ConfigureColumnsModal open={domain.open} onClose={() => domain.setOpen(false)} columns={domainOptional} visible={domain.visible} onApply={domain.setVisible} />
      </TablePanel>

      <Modal open={!!detailRow} onClose={() => setDetailRow(null)}>
        {detailRow && (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">인용된 프롬프트</h2>
                <p className="mt-1 break-all text-xs text-neutral-500">{detailRow.url}</p>
              </div>
              <ModalCloseButton onClose={() => setDetailRow(null)} />
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {detailRow.prompts.length === 0 ? (
                <li className="text-xs text-neutral-400">인용된 프롬프트 정보가 없습니다.</li>
              ) : (
                detailRow.prompts.map((prompt, i) => (
                  <li key={i} className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                    {prompt}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
