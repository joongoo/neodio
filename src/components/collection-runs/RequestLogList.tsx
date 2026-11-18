import Link from "next/link";
import { listRequestLogs, parseRequestLogOptions, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { formatKst } from "@/lib/backend/collectionRunsTypes";
import { RequestFilters, RequestPageLinks, REQUEST_STATUS_LABEL, surfaceLabel, usd } from "./RequestLogViews";

export async function RequestLogList({ base, organizationId, brandId, query }: { base: string; organizationId: string; brandId: string; query: URLSearchParams }) {
  const path = `${base}/collection-runs`;
  let options;
  try {
    options = parseRequestLogOptions(query);
  } catch (error) {
    if (!(error instanceof RequestLogInputError)) throw error;
    return <div role="alert" className="mx-auto max-w-6xl p-6">{error.message} <Link className="underline" href={path}>필터 초기화</Link></div>;
  }
  const data = await listRequestLogs(organizationId, brandId, options);
    return <section className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-neutral-900">수집 로그</h1><p className="mt-1 text-sm text-neutral-500">수집 요청별 진행 상황과 결과를 확인합니다.</p></div><Link href={`${path}?view=items`} className="inline-flex rounded-md bg-neutral-100 px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200">이전 개별 수집 이력</Link></header>
      <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">수집 요청에 연결된 실행을 표시합니다. 요청 연결 정보가 없는 과거 버전의 실행은 이전 개별 수집 이력에서 확인할 수 있습니다.</p>
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <RequestFilters path={path} query={query} />
      </div>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-left text-xs text-neutral-700"><thead className="border-b border-neutral-200 text-neutral-500"><tr>{["수집 요청", "등록 시각", "요청자", "엔진", "상태", "완료 / 전체", "실패 / 확인 필요", "예상 / 실제 USD"].map(h => <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead><tbody>
        {data.rows.map(row => <tr key={row.id} className="border-t border-neutral-100 hover:bg-neutral-50">
          <td className="px-5 py-3"><Link title={row.id} className="block max-w-40 truncate font-medium text-slate-800 hover:underline" href={`${path}/${encodeURIComponent(row.id)}?${new URLSearchParams({ back: query.toString() })}`}>{row.id}</Link></td>
          <td className="px-5 py-3 whitespace-nowrap">{formatKst(row.createdAt)}</td><td className="px-5 py-3 whitespace-nowrap">{row.requestedBy?.name ?? "-"}</td>
          <td className="px-5 py-3 min-w-36">{row.surfaces.map(surfaceLabel).join(", ")}</td><td className="px-5 py-3 whitespace-nowrap">{REQUEST_STATUS_LABEL[row.status]}</td>
          <td className="px-5 py-3 whitespace-nowrap">{row.counts.completed} / {row.counts.total}</td><td className="px-5 py-3 whitespace-nowrap">{row.counts.failed} / {row.counts.attention}</td><td className="px-5 py-3 whitespace-nowrap">{usd(row.estimatedCostUsd)} / {usd(row.actualCostUsd)}</td>
        </tr>)}
        {data.rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-neutral-500">조건에 맞는 수집 요청이 없습니다.</td></tr>}
      </tbody></table></div><div className="border-t border-neutral-200 px-5">
      <RequestPageLinks path={path} query={query} page={data.page} pageCount={data.pageCount} total={data.filteredTotal} />
      </div></div>
    </section>;
}
