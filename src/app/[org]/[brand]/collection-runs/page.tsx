import { CollectionRunsClient } from "@/components/collection-runs/CollectionRunsClient";
import { listCollectedRuns } from "@/lib/backend/collectionRuns";
import { processStoredPromptRuns as processPromptRuns } from "@/lib/backend/database/analysis";
import { seedBrands } from "@/lib/db/data/seed";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listCategories } from "@/lib/backend/categoryStore";
import { getRealBrandSeeds } from "@/lib/backend/brandSeeds";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { allAioKeywordTexts, listAioObservations } from "@/lib/backend/aio/store";
import type { AioLogRow } from "@/lib/backend/collectionRunsTypes";

// Always re-read .tmp/*-ai on request — the collector scripts
// (npm run collect:naver-ai / collect:google-ai) write new files between
// page loads, and this page has no other cache to invalidate.
export const dynamic = "force-dynamic";

// 구글AIO(aio_observations)는 일반 언급/인용 로그와 저장 구조가 완전히
// 달라서(결과가 prompt_runs가 아니라 YouTube 인용 전용 테이블에 쌓임) 이
// 페이지에 안 보여 "분명히 수집했는데 왜 로그에 없냐"는 혼란이 있었다.
// 전체 데이터를 합치는 대신 가벼운 한 줄로 섞어 보여주고 상세는 'YouTube
// AIO 인용' 화면으로 보낸다. 이 페이지 자체가 페이지네이션 없이 전체를
// 다 보여주는 방식이라(네이버/구글/Gemini도 전부), AIO만 건수를 잘라
// "더보기" 없이 숨기면 일관성이 깨진다 — 그래서 개수 제한 없이 전부 반환.
async function loadRecentAioRows(brandId: string | undefined): Promise<AioLogRow[]> {
  if (!brandId) return [];
  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [observations, keywordText] = await Promise.all([
    listAioObservations(brandId, { fromDate, toDate }).catch(() => []),
    allAioKeywordTexts(brandId).catch(() => new Map<string, string>()),
  ]);
  return [...observations]
    .reverse()
    .map((o) => ({
      id: o.id,
      keywordId: o.keywordId,
      keyword: keywordText.get(o.keywordId) ?? o.keywordId,
      runAt: o.collectedAt,
      status: o.status === "failed" ? ("failed" as const) : ("success" as const),
      aioPresent: o.status === "aio_present",
    }));
}

export default async function CollectionRunsPage() {
  const tenant = await getCurrentTenant();
  const [runFiles, brandsData, realCategories, aioRows] = await Promise.all([
    listCollectedRuns(tenant.orgId),
    db.brandsManagement.get(tenant.orgId),
    listCategories(tenant.orgId),
    loadRecentAioRows(tenant.brandId),
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
      aioRows={aioRows}
      processed={processed}
      brands={brands}
      categories={(brandsData?.categories ?? realCategories).map((c) => c.name)}
    />
  );
}
