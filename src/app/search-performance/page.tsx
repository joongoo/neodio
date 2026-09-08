import { SearchPerformanceClient } from "@/components/search-performance/SearchPerformanceClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getGscToken } from "@/lib/backend/gscTokenStore";
import { getRealGscSearchPerformance } from "@/lib/backend/gscSearchAnalyticsReader";
import { isDemoMode } from "@/lib/backend/demoMode";

const DEFAULT_BRAND_ID = "brand-neodigm";

// GSC 연결 상태/데이터가 방금 바뀌었을 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function SearchPerformancePage() {
  const demo = await isDemoMode();
  const [brand, gscMock, performanceMock, gscToken] = await Promise.all([
    db.brandsManagement.getBrand(DEFAULT_ORG_ID, DEFAULT_BRAND_ID),
    db.connections.getGsc(DEFAULT_BRAND_ID),
    db.gscSearchPerformance.get(DEFAULT_BRAND_ID),
    getGscToken(DEFAULT_BRAND_ID),
  ]);

  const gsc = !demo && gscToken
    ? {
        brandId: DEFAULT_BRAND_ID,
        status: "connected" as const,
        accountEmail: gscToken.accountEmail,
        property: gscToken.property,
        lastSyncedAt: gscToken.connectedAt,
        syncedQueries: gscMock?.syncedQueries ?? 0,
        syncedImpressions: gscMock?.syncedImpressions ?? 0,
        syncedClicks: gscMock?.syncedClicks ?? 0,
      }
    : gscMock;

  const realPerformance = !demo && gscToken ? await getRealGscSearchPerformance(DEFAULT_BRAND_ID).catch(() => null) : null;
  const performance = realPerformance ?? performanceMock;

  return (
    <SearchPerformanceClient
      brandName={brand?.name ?? "브랜드"}
      gsc={gsc}
      performance={performance}
      real={realPerformance !== null}
    />
  );
}
