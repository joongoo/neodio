import { BrandsManagementClient } from "@/components/brands-management/BrandsManagementClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { getManagedBrands } from "@/lib/backend/brandsManagementStore";

// 프롬프트 라이브러리(추적/삭제)와 브랜드 CRUD(추가/편집/삭제)가 언제든
// 바뀔 수 있어 캐시하면 안 된다 — 프롬프트 라이브러리 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function BrandsManagementPage() {
  const [data, realBrands, promptLibraryRowsRaw, trackedRows, deletedIds] = await Promise.all([
    db.brandsManagement.get(DEFAULT_ORG_ID),
    getManagedBrands(DEFAULT_ORG_ID),
    db.promptLibrary.list(DEFAULT_ORG_ID),
    listTrackedTopics(),
    getDeletedLibraryRowIds(),
  ]);
  if (!data) return null;

  // 카테고리의 "프롬프트 수"는 프롬프트 라이브러리 페이지가 실제로 보여주는
  // 것과 같은 실 데이터(시드 중 삭제되지 않은 것 + 추적으로 추가된 것)를
  // 기준으로 세야 한다 — 이전엔 seedPrompts/seedTopics 기반 mock 카운트를
  // 써서 프롬프트 라이브러리 화면의 실제 카테고리별 개수와 어긋났다.
  const libraryRows = [...promptLibraryRowsRaw.filter((r) => !deletedIds.has(r.id)), ...trackedRows];
  const promptCountByCategory = new Map<string, number>();
  for (const row of libraryRows) {
    promptCountByCategory.set(row.category, (promptCountByCategory.get(row.category) ?? 0) + 1);
  }
  const categories = data.categories.map((c) => ({ ...c, promptCount: promptCountByCategory.get(c.name) ?? 0 }));

  return <BrandsManagementClient initial={{ ...data, brands: realBrands, categories }} />;
}
