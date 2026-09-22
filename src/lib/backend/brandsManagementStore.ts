import { getPromptStore } from "./database";
import { DEFAULT_ORG_ID } from "@/lib/db";
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

export async function updateManagedBrand(brandId: string, patch: Partial<ManagedBrand>): Promise<void> {
  await (await getPromptStore()).updateBrand(DEFAULT_ORG_ID, brandId, patch);
}

export async function deleteManagedBrand(brandId: string): Promise<void> {
  await (await getPromptStore()).deleteBrand(DEFAULT_ORG_ID, brandId);
}
