import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getRequestLog, listRequestLogs, parseRequestLogOptions, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { RequestRelations } from "@/components/collection-runs/RequestRelations";
import { listRequestItems, parseRequestItemOptions } from "@/lib/backend/dataforseo/requestItems";
import { RequestFilters, RequestSummary } from "@/components/collection-runs/RequestLogViews";
import { RequestRunList } from "@/components/collection-runs/RequestRunList";
import { listCategories } from "@/lib/backend/categoryStore";
import { collectorDownloadsConfigured, collectionUsesLocalAgent } from "@/lib/backend/collectionMode";
import type { CollectorPlatform } from "@/lib/collectorAgent";

const COLLECTOR_PLATFORMS: CollectorPlatform[] = ["mac-arm64", "mac-x64", "win-x64"];

export const dynamic = "force-dynamic";

export default async function RequestLogDetailPage({ params, searchParams }: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await getCurrentTenant();
  const { requestId } = await params;
  const raw = await searchParams;
  const query = new URLSearchParams(Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const request = await getRequestLog(tenant.orgId, tenant.brandId, requestId);
  if (!request) notFound();
  const listPath = `${tenant.base}/collection-runs`;
  const back = new URLSearchParams(query.get("back") ?? "");
  back.delete("view");
  const path = `${listPath}/${encodeURIComponent(requestId)}`;
  let options;
  let retryOptions;
  try {
    options = parseRequestItemOptions(query);
    retryOptions = parseRequestLogOptions(new URLSearchParams({ page: query.get("retriesPage") ?? "1", size: "10" }));
  } catch (error) {
    if (!(error instanceof RequestLogInputError)) throw error;
    return <div role="alert" className="mx-auto max-w-6xl p-6">{error.message} <Link href={path} className="underline">필터 초기화</Link></div>;
  }
  const [items, categories, parent, retries] = await Promise.all([
    listRequestItems(tenant.orgId, tenant.brandId, requestId, options), listCategories(tenant.orgId),
    request.retryOfRequestId ? getRequestLog(tenant.orgId, tenant.brandId, request.retryOfRequestId) : Promise.resolve(null),
    listRequestLogs(tenant.orgId, tenant.brandId, retryOptions, undefined, undefined, requestId),
  ]);
  if (!items) notFound();
  return <section className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
    <Link href={`${listPath}?${back}`} className="text-sm underline">← 수집 요청 목록</Link>
    <header><h1 className="text-2xl font-semibold text-neutral-900">수집 요청 상세</h1><p className="mt-1 break-all text-xs text-neutral-500">{request.id}</p></header>
    <RequestSummary request={request} />
    <RequestRelations parent={parent} retries={retries.rows} total={retries.filteredTotal} page={retries.page} pageCount={retries.pageCount} path={path} query={query.toString()} listPath={listPath} itemCount={request.counts.total} />
    <div className="rounded-xl border border-neutral-200 bg-white p-4"><RequestFilters path={path} query={query} itemMode /></div>
    <RequestRunList key={requestId} items={items} requestId={requestId} brandId={tenant.brandId} total={request.counts.total} categories={categories.map(c => c.name)} search={options.q} orgName={tenant.org.name} base={tenant.base} serverCollector={!collectionUsesLocalAgent()} downloadPlatforms={collectorDownloadsConfigured() ? COLLECTOR_PLATFORMS : []} />
    <p className="text-xs text-neutral-500">최신 상태는 페이지를 새로고침해 확인하세요.</p>
    <Link className="text-sm underline" href={`${listPath}?view=items`}>이전 개별 수집 이력</Link>
  </section>;
}
