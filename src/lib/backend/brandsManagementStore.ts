import { getPromptStore } from "./database";
import { ManagedBrand } from "@/lib/db/types";

// 브랜드 관리의 브랜드 추가/편집/삭제 — 프롬프트/카테고리/토픽과 같은
// Postgres의 brands 테이블에 저장한다. 예전엔
// .tmp/brands-management-{added,patches,deleted}.json 세 파일을 시드 위에
// 얹어 계산했지만(하나만 지울 방법이 없는 mock 시드 특성상), 이제 시드
// 브랜드도 최초 1회 마이그레이션 때 실제 행으로 들어가 있어 다른 테이블과
// 동일하게 진짜로 추가/수정/삭제된다.
export async function getManagedBrands(orgId: string): Promise<ManagedBrand[]> {
  return (await getPromptStore()).listBrands(orgId);
}

export async function getManagedBrand(orgId: string, brandId: string): Promise<ManagedBrand | null> {
  return (await getPromptStore()).getBrand(orgId, brandId);
}

export async function createManagedBrand(orgId: string, brand: Omit<ManagedBrand, "id" | "organizationId">): Promise<ManagedBrand> {
  return (await getPromptStore()).createBrand(orgId, brand);
}

/** 조직을 모르는 곳(브랜드 id만 있는 API, 정기 수집 CLI)용 — 브랜드 id는 전역에서 유일하다. */
export async function getManagedBrandById(brandId: string): Promise<ManagedBrand | null> {
  return (await getPromptStore()).getBrandById(brandId);
}

export async function updateManagedBrand(brandId: string, patch: Partial<ManagedBrand>): Promise<void> {
  const brand = await getManagedBrandById(brandId);
  if (brand) await (await getPromptStore()).updateBrand(brand.organizationId, brandId, patch);
}

export async function deleteManagedBrand(brandId: string): Promise<void> {
  const brand = await getManagedBrandById(brandId);
  if (brand) await (await getPromptStore()).deleteBrand(brand.organizationId, brandId);
}
