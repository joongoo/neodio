import { BrandDetailClient } from "@/components/brands-management/BrandDetailClient";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";

// 브랜드 편집/상태 전환이 실 파일 저장소에 반영되므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const brand = await getManagedBrand(DEFAULT_ORG_ID, brandId);
  if (!brand) return null;

  return <BrandDetailClient initial={brand} />;
}
