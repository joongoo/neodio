import { BrandDetailClient } from "@/components/brands-management/BrandDetailClient";
import { getManagedBrand, getManagedBrands } from "@/lib/backend/brandsManagementStore";
import { assignBrandSlugs } from "@/lib/slug";
import { getRealTopBrands } from "@/lib/backend/collectionStatsReader";
import { listBrandYoutubeChannels } from "@/lib/backend/brandAioConfig";
import { channelCitationStats, seoulDate } from "@/lib/backend/aio/store";
import { addDays } from "@/lib/backend/aio/metrics";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 브랜드 편집/상태 전환이 실 파일 저장소에 반영되므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const tenant = await getCurrentTenant();
  const { brandId } = await params;
  const [brand, topBrands, youtubeChannels] = await Promise.all([
    getManagedBrand(tenant.orgId, brandId),
    getRealTopBrands().catch(() => null),
    listBrandYoutubeChannels(brandId),
  ]);
  if (!brand) return null;
  // 이 브랜드의 YouTube AIO 인용 화면 주소 — 지금 헤더에서 고른 브랜드가 아니라 이 브랜드 기준.
  const brandSlug = assignBrandSlugs(await getManagedBrands(tenant.orgId)).get(brand.id)!;
  const citationsHref = `/${encodeURIComponent(tenant.orgSlug)}/${encodeURIComponent(brandSlug)}/youtube-aio`;
  // 소셜 계정의 YouTube 채널별 최근 30일 AIO 인용 요약
  const stats =
    youtubeChannels.length > 0
      ? await channelCitationStats(brandId, youtubeChannels.map((c) => c.channelId), addDays(seoulDate(new Date().toISOString()), -30))
      : null;

  // 가시성 개요에서 실제로 언급된 브랜드 목록 — "추적할 기타 브랜드"의 +
  // 버튼이 여기서 골라 추가하게 한다. 이 브랜드 자기 자신은 빼고 보여준다.
  const ownNameLower = brand.name.trim().toLowerCase();
  const observedBrands = (topBrands ?? [])
    .filter((b) => b.brand.trim().toLowerCase() !== ownNameLower)
    .map((b) => ({ name: b.brand, mentions: b.mentions }));

  return (
    <BrandDetailClient
      initial={brand}
      observedBrands={observedBrands}
      youtubeChannels={youtubeChannels}
      channelCitationStats={stats ? Object.fromEntries(stats) : null}
      citationsHref={citationsHref}
    />
  );
}
