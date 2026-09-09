"use client";

import { useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { TablePanel } from "@/components/ui/TablePanel";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
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

const ownColumns: DataTableColumn<OwnCitedUrlRow>[] = [
  { key: "url", label: "URL", render: (r) => <UrlLink url={r.url} /> },
  { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
  { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
  { key: "contentVisibility", label: "콘텐츠 가시성", width: "w-[110px]", render: (r) => (r.contentVisibility === null ? "—" : `${r.contentVisibility}%`) },
  { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => r.category },
  { key: "market", label: "마켓", width: "w-[80px]", render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span> },
];
const ownOptional: ColumnOption[] = [
  { key: "citations", label: "인용 횟수" },
  { key: "citedPrompts", label: "인용된 프롬프트 수" },
  { key: "contentVisibility", label: "콘텐츠 가시성" },
  { key: "category", label: "카테고리" },
  { key: "market", label: "마켓" },
];

const thirdPartyColumns: DataTableColumn<ThirdPartyUrlRow>[] = [
  { key: "url", label: "URL", render: (r) => <UrlLink url={r.url} /> },
  { key: "contentType", label: "콘텐츠 유형", width: "w-[100px]", render: (r) => r.contentType },
  { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
  { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
  { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => r.category },
  { key: "market", label: "마켓", width: "w-[80px]", render: (r) => <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span> },
];
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
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [rows, clampedPage]
  );
  return { page: clampedPage, setPage, pageCount, pageRows };
}

export function UrlInspectorClient({ data }: { data: UrlInspectorData }) {
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);

  const ownRows = data.ownUrls.filter((r) => (market === "전체" || r.market === market) && (category === "전체" || r.category === category));
  const thirdPartyRows = data.thirdPartyUrls.filter((r) => (market === "전체" || r.market === market) && (category === "전체" || r.category === category));

  const own = useColumnVisibility(ownColumns, ownOptional);
  const thirdParty = useColumnVisibility(thirdPartyColumns, thirdPartyOptional);
  const domain = useColumnVisibility(domainColumns, domainOptional);

  const ownPaged = usePagedRows(ownRows);
  const thirdPartyPaged = usePagedRows(thirdPartyRows);
  const domainPaged = usePagedRows(data.citedDomains);

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

      <TablePanel title="자사 인용 URL" description="AI 답변에 인용된 우리 사이트 URL입니다." count={0} total={ownRows.length} onConfigureColumns={() => own.setOpen(true)}>
        <DataTable columns={own.filtered} rows={ownPaged.pageRows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination page={ownPaged.page} pageCount={ownPaged.pageCount} pageSize={PAGE_SIZE} totalCount={ownRows.length} onPageChange={ownPaged.setPage} />
        </div>
        <ConfigureColumnsModal open={own.open} onClose={() => own.setOpen(false)} columns={ownOptional} visible={own.visible} onApply={own.setVisible} />
      </TablePanel>

      <TablePanel
        title="인용된 제3자 URL"
        description="AI 답변에 인용된 제3자 사이트 URL입니다."
        count={0}
        total={thirdPartyRows.length}
        onConfigureColumns={() => thirdParty.setOpen(true)}
      >
        <DataTable columns={thirdParty.filtered} rows={thirdPartyPaged.pageRows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination
            page={thirdPartyPaged.page}
            pageCount={thirdPartyPaged.pageCount}
            pageSize={PAGE_SIZE}
            totalCount={thirdPartyRows.length}
            onPageChange={thirdPartyPaged.setPage}
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
        count={0}
        total={data.citedDomains.length}
        onConfigureColumns={() => domain.setOpen(true)}
      >
        <DataTable columns={domain.filtered} rows={domainPaged.pageRows} getRowId={(r) => r.id} />
        <div className="mt-3">
          <Pagination
            page={domainPaged.page}
            pageCount={domainPaged.pageCount}
            pageSize={PAGE_SIZE}
            totalCount={data.citedDomains.length}
            onPageChange={domainPaged.setPage}
          />
        </div>
        <ConfigureColumnsModal open={domain.open} onClose={() => domain.setOpen(false)} columns={domainOptional} visible={domain.visible} onApply={domain.setVisible} />
      </TablePanel>
    </div>
  );
}
