import { CollectionRunsClient } from "@/components/collection-runs/CollectionRunsClient";
import { listCollectedRuns } from "@/lib/backend/collectionRuns";
import { isBotBlocked } from "@/lib/backend/collectionRunsTypes";
import { processStoredPromptRuns as processPromptRuns } from "@/lib/backend/database/analysis";
import { seedBrands } from "@/lib/db/data/seed";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listCategories } from "@/lib/backend/categoryStore";
import { getRealBrandSeeds } from "@/lib/backend/brandSeeds";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { pageRunList, toRunListRow } from "@/lib/collectionRunList";

// Always re-read .tmp/*-ai on request — the collector scripts
// (npm run collect:naver-ai / collect:google-ai) write new files between
// page loads, and this page has no other cache to invalidate.
export const dynamic = "force-dynamic";

export default async function CollectionRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getCurrentTenant();
  const [runFiles, brandsData, realCategories] = await Promise.all([
    listCollectedRuns(tenant.orgId),
    db.brandsManagement.get(tenant.orgId),
    listCategories(tenant.orgId),
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
  const listPage = pageRunList(runFiles.map(toRunListRow), {
    search: params.q,
    page: Number(params.page),
    pageSize: Number(params.size),
  });

  return (
    <CollectionRunsClient
      listPage={listPage}
      search={params.q ?? ""}
      stats={{
        total: runFiles.length,
        success: runFiles.filter((f) => f.promptRun.status === "success" && !isBotBlocked(f.promptRun)).length,
        ownMentions: processed.mentions.filter((m) => m.brandId === ownBrandId && m.isPresent).length,
        ownCitations: processed.citations.filter((c) => c.isOwnDomain).length,
      }}
      categories={(brandsData?.categories ?? realCategories).map((c) => c.name)}
    />
  );
}
