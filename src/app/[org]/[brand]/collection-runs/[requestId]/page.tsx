import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getRequestLog, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { listRequestItems, parseRequestItemOptions } from "@/lib/backend/dataforseo/requestItems";
import { RequestFilters, RequestSummary } from "@/components/collection-runs/RequestLogViews";
import { RequestRunList } from "@/components/collection-runs/RequestRunList";
import { listCategories } from "@/lib/backend/categoryStore";
import { getPromptStore } from "@/lib/backend/database";
import { LegacyRetryControl } from "@/components/collection-runs/LegacyRetryControl";
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
  try {
    options = parseRequestItemOptions(query);
  } catch (error) {
    if (!(error instanceof RequestLogInputError)) throw error;
    return <div role="alert" className="mx-auto max-w-6xl p-6">{error.message} <Link href={path} className="underline">필터 초기화</Link></div>;
  }
  const [items, categories, retryable] = await Promise.all([
    listRequestItems(tenant.orgId, tenant.brandId, requestId, options), listCategories(tenant.orgId),
    (await getPromptStore()).query(`SELECT id FROM legacy_collection_items WHERE collection_request_id=$1 AND organization_id=$2 AND brand_id=$3 AND status<>'completed' LIMIT 1`, [requestId, tenant.orgId, tenant.brandId]),
  ]);
  if (!items) notFound();
  return <section className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
    <Link href={`${listPath}?${back}`} className="text-sm underline">← 수집 요청 목록</Link>
    <header><h1 className="text-2xl font-semibold text-neutral-900">수집 요청 상세</h1><p className="mt-1 break-all text-xs text-neutral-500">{request.id}</p></header>
    <RequestSummary request={request} />
    {retryable.length > 0 && <LegacyRetryControl requestId={requestId} brandId={tenant.brandId} orgName={tenant.org.name} base={tenant.base} serverCollector={!collectionUsesLocalAgent()} downloadPlatforms={collectorDownloadsConfigured() ? COLLECTOR_PLATFORMS : []} />}
    <div className="rounded-xl border border-neutral-200 bg-white p-4"><RequestFilters path={path} query={query} itemMode /></div>
    <RequestRunList key={query.toString()} items={items} requestId={requestId} brandId={tenant.brandId} total={request.counts.total} categories={categories.map(c => c.name)} search={options.q} />
    <p className="text-xs text-neutral-500">최신 상태는 페이지를 새로고침해 확인하세요.</p>
    <Link className="text-sm underline" href={`${listPath}?view=items`}>이전 개별 수집 이력</Link>
  </section>;
}
