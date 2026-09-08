import { SearchPerformanceClient } from "@/components/search-performance/SearchPerformanceClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

const DEFAULT_BRAND_ID = "brand-neodigm";

export default async function SearchPerformancePage() {
  const [brand, gsc, performance] = await Promise.all([
    db.brandsManagement.getBrand(DEFAULT_ORG_ID, DEFAULT_BRAND_ID),
    db.connections.getGsc(DEFAULT_BRAND_ID),
    db.gscSearchPerformance.get(DEFAULT_BRAND_ID),
  ]);

  return <SearchPerformanceClient brandName={brand?.name ?? "브랜드"} gsc={gsc} performance={performance} />;
}
