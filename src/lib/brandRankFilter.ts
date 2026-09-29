// 가시성 개요 "최신 상위 브랜드" 표의 역할 필터 — 어떤 행이 어느 묶음(자사·경쟁사·솔루션…)에 속하는지와
// 필터를 적용하는 규칙. 화면과 테스트가 같은 함수를 쓰도록 순수 함수로 둔다.
import type { BrandRankRow } from "@/lib/db/types";
import type { BrandKind, CompetitorTier } from "@/lib/brandOptimization";

export type RoleBucket = "own" | "competitor" | "solution" | "partner" | "channel" | "other";
export type TierBucket = CompetitorTier | "none";

export const ROLE_BUCKETS: RoleBucket[] = ["own", "competitor", "solution", "partner", "channel", "other"];
export const ROLE_BUCKET_LABEL: Record<RoleBucket, string> = {
  own: "자사",
  competitor: "경쟁사",
  solution: "솔루션·플랫폼",
  partner: "파트너·구축사",
  channel: "채널·매체",
  // 아직 역할이 없는 신규 후보와 미분류도 여기 들어간다 — 검토 전 항목이라 기본으로는 숨긴다.
  other: "기타·미분류",
};
export const DEFAULT_ROLE_FILTER: RoleBucket[] = ["own", "competitor"];

export const TIER_BUCKETS: TierBucket[] = ["core", "adjacent", "enterprise", "niche", "none"];
export const TIER_BUCKET_LABEL: Record<TierBucket, string> = { core: "핵심", adjacent: "인접", enterprise: "상위 시장", niche: "소규모 전문", none: "등급 미정" };
// 소규모 전문 업체는 핵심 경쟁사가 아니므로 기본으로는 숨긴다.
export const DEFAULT_TIER_FILTER: TierBucket[] = ["core", "adjacent", "enterprise", "none"];

export interface BrandRoleInfo {
  kind?: BrandKind;
  tier?: CompetitorTier;
}

export const rowKey = (row: Pick<BrandRankRow, "brand">) => row.brand.toLocaleLowerCase("ko-KR");

/** 제외 처리한 행은 항상 숨기므로 "excluded"로 따로 돌려준다. */
export function roleBucketOf(row: BrandRankRow, info?: BrandRoleInfo): RoleBucket | "excluded" {
  if (row.isOwn) return "own";
  if (row.decisionStatus === "excluded") return "excluded";
  switch (info?.kind) {
    case "competitor":
    case "solution":
    case "partner":
    case "channel":
      return info.kind;
    default:
      return "other";
  }
}

export const tierBucketOf = (tier?: CompetitorTier): TierBucket => tier ?? "none";

export function filterBrandRows(
  rows: BrandRankRow[],
  infoByName: Map<string, BrandRoleInfo>,
  roles: ReadonlySet<RoleBucket>,
  tiers: ReadonlySet<TierBucket>
): BrandRankRow[] {
  return rows.filter((row) => {
    const info = infoByName.get(rowKey(row));
    const bucket = roleBucketOf(row, info);
    if (bucket === "excluded" || !roles.has(bucket)) return false;
    return bucket !== "competitor" || tiers.has(tierBucketOf(info?.tier));
  });
}

/** 필터 드롭다운에 보여 줄 묶음별 개수(제외 처리한 행은 따로 센다). 경쟁사는 등급별 개수도 준다. */
export function countBrandRows(rows: BrandRankRow[], infoByName: Map<string, BrandRoleInfo>) {
  const roles = Object.fromEntries(ROLE_BUCKETS.map((b) => [b, 0])) as Record<RoleBucket, number>;
  const tiers = Object.fromEntries(TIER_BUCKETS.map((b) => [b, 0])) as Record<TierBucket, number>;
  let excluded = 0;
  for (const row of rows) {
    const info = infoByName.get(rowKey(row));
    const bucket = roleBucketOf(row, info);
    if (bucket === "excluded") {
      excluded += 1;
      continue;
    }
    roles[bucket] += 1;
    if (bucket === "competitor") tiers[tierBucketOf(info?.tier)] += 1;
  }
  return { roles, tiers, excluded };
}
