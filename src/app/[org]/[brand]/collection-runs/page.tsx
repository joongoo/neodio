import { CollectionRunsClient } from "@/components/collection-runs/CollectionRunsClient";
import { listCollectedRuns } from "@/lib/backend/collectionRuns";
import { processStoredPromptRuns as processPromptRuns } from "@/lib/backend/database/analysis";
import { seedBrands } from "@/lib/db/data/seed";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listCategories } from "@/lib/backend/categoryStore";
import { getRealBrandSeeds } from "@/lib/backend/brandSeeds";
import { getCurrentTenant } from "@/lib/backend/tenant";

// Always re-read .tmp/*-ai on request — the collector scripts
// (npm run collect:naver-ai / collect:google-ai) write new files between
// page loads, and this page has no other cache to invalidate.
export const dynamic = "force-dynamic";

export default async function CollectionRunsPage() {
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

  return (
    <CollectionRunsClient
      runFiles={runFiles}
      processed={processed}
      brands={brands}
      categories={(brandsData?.categories ?? realCategories).map((c) => c.name)}
    />
  );
}
