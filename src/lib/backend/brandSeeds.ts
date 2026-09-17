import { getManagedBrand } from "./brandsManagementStore";
import { DEFAULT_BRAND_ID } from "@/lib/db";
import { BrandSeed } from "@/lib/db/types";

// 실 언급/인용 집계(processing/mentions.ts, extractMentionsFromRun)가 쓰는
// 브랜드 목록의 단일 소스 — 예전엔 db/data/seed.ts의 seedBrands가 코드에
// 박혀있어서, 브랜드 관리 화면에서 별칭/기타 브랜드를 아무리 고쳐도 실제
// 집계에는 반영되지 않았다. 이제 브랜드 관리(SQLite brands 테이블)에서
// 직접 만든다 — 별칭을 추가하면 다음 분석부터 바로 반영된다.
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function getRealBrandSeeds(orgId: string): Promise<BrandSeed[]> {
  const own = await getManagedBrand(orgId, DEFAULT_BRAND_ID);
  if (!own) return [];

  const ownSeed: BrandSeed = {
    id: own.id,
    organizationId: orgId,
    name: own.name,
    domain: hostnameOf(own.url),
    isOwnBrand: true,
    status: own.status,
    category: own.industry,
    aliases: own.aliases,
  };

  const otherSeeds: BrandSeed[] = own.otherBrands.map((other) => ({
    id: `brand-other-${slug(other.name)}`,
    organizationId: orgId,
    name: other.name,
    domain: "",
    isOwnBrand: false,
    status: "active",
    category: "",
    aliases: other.aliases,
  }));

  return [ownSeed, ...otherSeeds];
}
