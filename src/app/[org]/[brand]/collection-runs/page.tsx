import { CollectionRunsClient } from "@/components/collection-runs/CollectionRunsClient";
import Link from "next/link";
import { RequestLogList } from "@/components/collection-runs/RequestLogList";
import { listCollectedRuns } from "@/lib/backend/collectionRuns";
import { isBotBlocked } from "@/lib/backend/collectionRunsTypes";
import { processStoredPromptRuns as processPromptRuns } from "@/lib/backend/database/analysis";
import { seedBrands } from "@/lib/db/data/seed";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listCategories } from "@/lib/backend/categoryStore";
import { getRealBrandSeeds } from "@/lib/backend/brandSeeds";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";
import { PostgresCollectionRequestStore } from "@/lib/backend/dataforseo/collectionRequestStore";
import { pageRunList, toPendingRunListRow, toRunListRow } from "@/lib/collectionRunList";

// Always re-read .tmp/*-ai on request — the collector scripts
// (npm run collect:naver-ai / collect:google-ai) write new files between
// page loads, and this page has no other cache to invalidate.
export const dynamic = "force-dynamic";

export default async function CollectionRunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tenant = await getCurrentTenant();
  if (params.view !== "items") {
    const query = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
    return <RequestLogList base={tenant.base} organizationId={tenant.orgId} brandId={tenant.brandId} query={query} />;
  }
  const [runFiles, brandsData, realCategories, activeProviderTasks, collectionRequests] = await Promise.all([
    listCollectedRuns(tenant.orgId),
    db.brandsManagement.get(tenant.orgId),
    listCategories(tenant.orgId),
    tenant.brandId ? new PostgresProviderTaskStore().listActive(tenant.orgId, tenant.brandId) : [],
    tenant.brandId ? new PostgresCollectionRequestStore().listRecentSummaries(tenant.orgId, tenant.brandId) : [],
  ]);
  // 기본 조직은 예전처럼 시드 브랜드로 언급을 판정하고, 다른 조직은 그 조직의
  // 자사 브랜드 + 기타 브랜드(브랜드 설정)로 판정한다.
  const brands =
    tenant.orgId === DEFAULT_ORG_ID ? seedBrands : tenant.brandId ? await getRealBrandSeeds(tenant.orgId, tenant.brandId) : [];
  const processed = await processPromptRuns({
    organizationId: tenant.orgId,
    ownBrandId: tenant.brandId,
    promptRuns: runFiles.map((f) => f.promptRun),
    brands,
  });
  const ownBrandId = brands.find((b) => b.isOwnBrand)?.id;

  // 화면에는 요약 행 한 페이지만 보낸다 — 답변 원문·인용 목록 전체를 브라우저로 보내면 실행 수에
  // 비례해 커진다(예전엔 127건에 1.2MB). 원문은 행을 펼칠 때 /api/collection-runs/detail로 불러온다.
  const listRows = [...activeProviderTasks.map(toPendingRunListRow), ...runFiles.map(toRunListRow)]
    .sort((a, b) => b.runAt.localeCompare(a.runAt));
  const listPage = pageRunList(listRows, {
    search: typeof params.q === "string" ? params.q : undefined,
    page: Number(params.page),
    pageSize: Number(params.size),
  });

  return (
    <><div className="mx-auto max-w-6xl px-6 pt-6"><Link className="text-sm font-medium text-slate-700 hover:underline" href={`${tenant.base}/collection-runs`}>← 수집 요청 목록</Link></div><CollectionRunsClient
      listPage={listPage}
      search={typeof params.q === "string" ? params.q : ""}
      brandId={tenant.brandId ?? ""}
      pollingTaskIds={activeProviderTasks.filter((task) => task.status !== "reserved").map((task) => task.id)}
      collectionRequests={collectionRequests}
      stats={{
        total: listRows.length,
        pending: activeProviderTasks.length,
        success: runFiles.filter((f) => f.promptRun.status === "success" && !isBotBlocked(f.promptRun)).length,
        ownMentions: processed.mentions.filter((m) => m.brandId === ownBrandId && m.isPresent).length,
        ownCitations: processed.citations.filter((c) => c.isOwnDomain).length,
      }}
      categories={(brandsData?.categories ?? realCategories).map((c) => c.name)}
    /></>
  );
}
