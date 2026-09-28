import { BrandsManagementClient } from "@/components/brands-management/BrandsManagementClient";
import { db } from "@/lib/db";
import { listCategories } from "@/lib/backend/categoryStore";
import { getManagedBrands } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 프롬프트 라이브러리(추적/삭제)와 브랜드 CRUD(추가/편집/삭제)가 언제든
// 바뀔 수 있어 캐시하면 안 된다 — 프롬프트 라이브러리 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function BrandsManagementPage() {
  const tenant = await getCurrentTenant();
  const [data, realBrands, categories] = await Promise.all([
    db.brandsManagement.get(tenant.orgId),
    getManagedBrands(tenant.orgId),
    listCategories(tenant.orgId),
  ]);
  // 목업(db.brandsManagement)은 기본 조직에만 있다 — 새 조직은 실데이터만으로 그린다.
  return <BrandsManagementClient initial={{ ...(data ?? { brands: [], categories: [] }), brands: realBrands, categories }} />;
}
