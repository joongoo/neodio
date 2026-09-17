import { BrandsManagementClient } from "@/components/brands-management/BrandsManagementClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listCategories } from "@/lib/backend/categoryStore";
import { getManagedBrands } from "@/lib/backend/brandsManagementStore";

// 프롬프트 라이브러리(추적/삭제)와 브랜드 CRUD(추가/편집/삭제)가 언제든
// 바뀔 수 있어 캐시하면 안 된다 — 프롬프트 라이브러리 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function BrandsManagementPage() {
  const [data, realBrands, categories] = await Promise.all([
    db.brandsManagement.get(DEFAULT_ORG_ID),
    getManagedBrands(DEFAULT_ORG_ID),
    listCategories(DEFAULT_ORG_ID),
  ]);
  if (!data) return null;

  return <BrandsManagementClient initial={{ ...data, brands: realBrands, categories }} />;
}
