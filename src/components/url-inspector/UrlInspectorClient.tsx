"use client";

import { useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { TablePanel } from "@/components/ui/TablePanel";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { CitedDomainRow, OwnCitedUrlRow, ThirdPartyUrlRow, UrlInspectorData } from "@/lib/db";

const MARKET_OPTIONS = ["전체", "KR", "US", "GLOBAL"];
const CATEGORY_OPTIONS = ["전체", "마케팅", "브랜드", "여행"];

const ownColumns: DataTableColumn<OwnCitedUrlRow>[] = [
  { key: "url", label: "URL", render: (r) => <span className="truncate text-blue-600">{r.url}</span> },
  { key: "citations", label: "인용 횟수", width: "w-[90px]", render: (r) => r.citations },
  { key: "citedPrompts", label: "인용된 프롬프트 수", width: "w-[130px]", render: (r) => r.citedPrompts },
  { key: "contentVisibility", label: "콘텐츠 가시성", width: "w-[110px]", render: (r) => `${r.contentVisibility}%` },
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
  { key: "url", label: "URL", render: (r) => <span className="truncate text-blue-600">{r.url}</span> },
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

export function UrlInspectorClient({ data }: { data: UrlInspectorData }) {
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);

  const ownRows = data.ownUrls.filter((r) => (market === "전체" || r.market === market) && (category === "전체" || r.category === category));
  const thirdPartyRows = data.thirdPartyUrls.filter((r) => (market === "전체" || r.market === market) && (category === "전체" || r.category === category));

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
        <DataTable columns={own.filtered} rows={ownRows} getRowId={(r) => r.id} />
        <ConfigureColumnsModal open={own.open} onClose={() => own.setOpen(false)} columns={ownOptional} visible={own.visible} onApply={own.setVisible} />
      </TablePanel>

      <TablePanel
        title="인용된 제3자 URL"
        description="AI 답변에 인용된 제3자 사이트 URL입니다."
        count={0}
        total={thirdPartyRows.length}
        onConfigureColumns={() => thirdParty.setOpen(true)}
      >
        <DataTable columns={thirdParty.filtered} rows={thirdPartyRows} getRowId={(r) => r.id} />
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
        <DataTable columns={domain.filtered} rows={data.citedDomains} getRowId={(r) => r.id} />
        <ConfigureColumnsModal open={domain.open} onClose={() => domain.setOpen(false)} columns={domainOptional} visible={domain.visible} onApply={domain.setVisible} />
      </TablePanel>
    </div>
  );
}
