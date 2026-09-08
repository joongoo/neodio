import { DataTableColumn, DataTable } from "@/components/ui/DataTable";
import { GoogleSearchResultRow, NaverSearchResultRow } from "@/lib/db";
import { NORMALIZATION_MAP, rawGooglePayload, rawNaverPayload } from "@/lib/searchCollectionPipeline";

function BrandBadge({ isOwnBrand }: { isOwnBrand: boolean }) {
  return isOwnBrand ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">우리 브랜드</span>
  ) : (
    <span className="text-xs text-neutral-400">—</span>
  );
}

function RawPayloadDetail({ raw }: { raw: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3 bg-neutral-50 p-4 text-xs">
      <div>
        <p className="mb-1 font-semibold text-neutral-600">수집된 원본(raw) 응답</p>
        <pre className="overflow-x-auto rounded-md bg-white p-3 text-neutral-700">{JSON.stringify(raw, null, 2)}</pre>
      </div>
      <div>
        <p className="mb-1 font-semibold text-neutral-600">정규화 매핑</p>
        <table className="w-full text-left">
          <thead>
            <tr className="text-neutral-500">
              <th className="py-1 pr-3 font-medium">원본 필드</th>
              <th className="py-1 pr-3 font-medium">저장 필드</th>
              <th className="py-1 font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {NORMALIZATION_MAP.map((row) => (
              <tr key={row.raw} className="border-t border-neutral-100 text-neutral-600">
                <td className="py-1 pr-3">{row.raw}</td>
                <td className="py-1 pr-3">{row.stored}</td>
                <td className="py-1">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const naverColumns: DataTableColumn<NaverSearchResultRow>[] = [
  { key: "rank", label: "순위", width: "w-[56px]", render: (r) => r.rank },
  { key: "blockType", label: "블록 유형", width: "w-[96px]", render: (r) => r.blockType },
  {
    key: "title",
    label: "제목 / URL",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-neutral-800">{r.title}</span>
        <span className="text-xs text-neutral-400">{r.url}</span>
      </div>
    ),
  },
  { key: "isOwnBrand", label: "브랜드", width: "w-[96px]", render: (r) => <BrandBadge isOwnBrand={r.isOwnBrand} /> },
];

const googleColumns: DataTableColumn<GoogleSearchResultRow>[] = [
  { key: "rank", label: "순위", width: "w-[56px]", render: (r) => r.rank },
  {
    key: "type",
    label: "유형",
    width: "w-[96px]",
    render: (r) => (r.isAiOverview ? "AI Overview" : "일반"),
  },
  {
    key: "title",
    label: "제목 / URL",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-neutral-800">{r.title}</span>
        <span className="text-xs text-neutral-400">{r.url}</span>
      </div>
    ),
  },
  { key: "isOwnBrand", label: "브랜드", width: "w-[96px]", render: (r) => <BrandBadge isOwnBrand={r.isOwnBrand} /> },
];

export function NaverSearchResultsTable({ rows }: { rows: NaverSearchResultRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-neutral-900">네이버 통합검색</p>
      <DataTable
        columns={naverColumns}
        rows={rows}
        getRowId={(r) => r.id}
        renderExpanded={(r) => <RawPayloadDetail raw={rawNaverPayload(r)} />}
      />
    </div>
  );
}

export function GoogleSearchResultsTable({ rows }: { rows: GoogleSearchResultRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-neutral-900">구글 검색</p>
      <DataTable
        columns={googleColumns}
        rows={rows}
        getRowId={(r) => r.id}
        renderExpanded={(r) => <RawPayloadDetail raw={rawGooglePayload(r)} />}
      />
    </div>
  );
}
