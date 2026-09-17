import { SearchPerformanceClient } from "@/components/search-performance/SearchPerformanceClient";
import { DEFAULT_BRAND_ID, DEFAULT_ORG_ID, db } from "@/lib/db";
import { getGscToken } from "@/lib/backend/gscTokenStore";
import { getRealGscSearchPerformance } from "@/lib/backend/gscSearchAnalyticsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";

// GSC 연결 상태/데이터가 방금 바뀌었을 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function SearchPerformancePage() {
  const demo = await isDemoMode();
  const [brand, gscMock, performanceMock, gscToken] = await Promise.all([
    getManagedBrand(DEFAULT_ORG_ID, DEFAULT_BRAND_ID),
    db.connections.getGsc(DEFAULT_BRAND_ID),
    db.gscSearchPerformance.get(DEFAULT_BRAND_ID),
    getGscToken(DEFAULT_BRAND_ID),
  ]);

  const realPerformance = gscToken && !demo ? await getRealGscSearchPerformance(DEFAULT_BRAND_ID).catch(() => null) : null;
  const performance = realPerformance ?? (demo ? performanceMock : null);

  // gscMock(항상 "connected")은 "Demo" 브랜드에서만 쓴다 — 실 토큰이 없는데
  // mock으로 폴백하면 연결 해제를 눌러도 계속 "연결됨"으로 보이는 버그가
  // 생긴다 (실제로 겪은 버그, connections 페이지와 동일한 원인). "동기화
  // 통계"도 mock 수치가 아니라 realPerformance의 실측 합계를 쓴다.
  const gsc = gscToken && !demo
    ? {
        brandId: DEFAULT_BRAND_ID,
        status: "connected" as const,
        accountEmail: gscToken.accountEmail,
        property: gscToken.property,
        lastSyncedAt: gscToken.connectedAt,
        syncedQueries: realPerformance?.totalQueries ?? 0,
        syncedImpressions: realPerformance?.totalImpressions ?? 0,
        syncedClicks: realPerformance?.totalClicks ?? 0,
      }
    : demo
      ? gscMock
      : null;

  return (
    <SearchPerformanceClient
      brandName={brand?.name ?? "브랜드"}
      gsc={gsc}
      performance={performance}
      real={realPerformance !== null}
    />
  );
}
