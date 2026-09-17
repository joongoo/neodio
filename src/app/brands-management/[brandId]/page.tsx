import { BrandDetailClient } from "@/components/brands-management/BrandDetailClient";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getRealTopBrands } from "@/lib/backend/collectionStatsReader";

// 브랜드 편집/상태 전환이 실 파일 저장소에 반영되므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const [brand, topBrands] = await Promise.all([
    getManagedBrand(DEFAULT_ORG_ID, brandId),
    getRealTopBrands().catch(() => null),
  ]);
  if (!brand) return null;

  // 가시성 개요에서 실제로 언급된 브랜드 목록 — "추적할 기타 브랜드"의 +
  // 버튼이 여기서 골라 추가하게 한다. 이 브랜드 자기 자신은 빼고 보여준다.
  const ownNameLower = brand.name.trim().toLowerCase();
  const observedBrands = (topBrands ?? [])
    .filter((b) => b.brand.trim().toLowerCase() !== ownNameLower)
    .map((b) => ({ name: b.brand, mentions: b.mentions }));

  return <BrandDetailClient initial={brand} observedBrands={observedBrands} />;
}
