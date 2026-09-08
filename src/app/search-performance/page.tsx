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

  // gscMock(항상 "connected")은 "Demo" 브랜드에서만 쓴다 — 실 토큰이 없는데
  // mock으로 폴백하면 연결 해제를 눌러도 계속 "연결됨"으로 보이는 버그가
  // 생긴다 (실제로 겪은 버그, connections 페이지와 동일한 원인).
  const gsc = gscToken && !demo
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
    : demo
      ? gscMock
      : null;

  const realPerformance = gscToken && !demo ? await getRealGscSearchPerformance(DEFAULT_BRAND_ID).catch(() => null) : null;
  const performance = realPerformance ?? (demo ? performanceMock : null);

  return (
    <SearchPerformanceClient
      brandName={brand?.name ?? "브랜드"}
      gsc={gsc}
      performance={performance}
      real={realPerformance !== null}
    />
  );
}
