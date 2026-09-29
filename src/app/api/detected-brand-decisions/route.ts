import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { isBrandKind, isCompetitorTier, MAX_SUGGESTIONS, type BrandRoleAssignment, type BrandSuggestion } from "@/lib/brandOptimization";
import {
  applyDetectedBrandOptimization,
  approveDetectedBrand,
  clearDetectedBrandDecision,
  excludeDetectedBrand,
  mergeDetectedBrands,
  removeDetectedCompetitor,
  setBrandRoles,
  type BrandRoleChange,
} from "@/lib/backend/detectedBrandDecisions";

type OptimizationCompetitor = { name: string; aliases?: string[]; evidenceDomain?: string | null };
type OptimizationExclusion = { name: string; evidenceDomain?: string | null };

function isOptimizationCompetitor(item: unknown): item is OptimizationCompetitor {
  return typeof (item as { name?: unknown })?.name === "string";
}

function isOptimizationExclusion(item: unknown): item is OptimizationExclusion {
  return typeof (item as { name?: unknown })?.name === "string";
}

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  // 브랜드 설정 화면은 헤더에서 고른 브랜드가 아니라 지금 보고 있는 브랜드를 정리하므로 brandId를 받을 수 있다
  // (같은 조직의 브랜드만 허용).
  const brandId = typeof body.brandId === "string" && body.brandId ? body.brandId : tenant.brandId;
  if (!brandId) return NextResponse.json({ error: "브랜드를 먼저 등록하세요." }, { status: 400 });
  if (brandId !== tenant.brandId && !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "이 조직의 브랜드가 아닙니다." }, { status: 404 });
  }

  if (body.status === "merged") {
    const mergeTarget = body.mergeTarget === "own" ? "own" : "competitor";
    if (
      !Array.isArray(body.brands) ||
      body.brands.length < (mergeTarget === "own" ? 1 : 2) ||
      !body.brands.every((brand: unknown) => typeof (brand as { name?: unknown })?.name === "string")
    ) {
      return NextResponse.json({ error: mergeTarget === "own" ? "내 브랜드로 등록할 브랜드를 선택해주세요." : "병합할 브랜드를 2개 이상 선택해주세요." }, { status: 400 });
    }
    await mergeDetectedBrands(
      body.brands.map((brand: { name: string; mentions?: number; evidenceDomain?: string | null }) => ({
        name: brand.name.trim(),
        mentions: typeof brand.mentions === "number" ? brand.mentions : 0,
        evidenceDomain: typeof brand.evidenceDomain === "string" ? brand.evidenceDomain : null,
      })),
      mergeTarget,
      tenant.orgId,
      brandId
    );
    return NextResponse.json({ ok: true });
  }

  // 순위표에서 고른 브랜드들의 역할·등급을 한 번에 바꾼다(일괄 변경).
  if (body.status === "roles") {
    const items: BrandRoleChange[] = (Array.isArray(body.items) ? (body.items as unknown[]) : []).flatMap((item) => {
      const entry = item as { name?: unknown; kind?: unknown; tier?: unknown; evidenceDomain?: unknown };
      if (typeof entry?.name !== "string" || !entry.name.trim() || entry.name.length > 100) return [];
      if (entry.kind !== "excluded" && !isBrandKind(entry.kind)) return [];
      const tier = entry.tier === null ? null : isCompetitorTier(entry.tier) ? entry.tier : undefined;
      return [{ name: entry.name.trim(), kind: entry.kind as BrandRoleChange["kind"], tier, evidenceDomain: typeof entry.evidenceDomain === "string" ? entry.evidenceDomain : null }];
    });
    if (items.length === 0 || items.length > 200) {
      return NextResponse.json({ error: "바꿀 브랜드를 1~200개 선택해주세요." }, { status: 400 });
    }
    await setBrandRoles(items, tenant.orgId, brandId);
    return NextResponse.json({ ok: true });
  }

  if (body.status === "optimized") {
    const data = body.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json({ error: "data가 필요합니다." }, { status: 400 });
    }
    const ownAliases = Array.isArray(data.ownAliases) ? (data.ownAliases as unknown[]) : [];
    const competitors = Array.isArray(data.competitors) ? (data.competitors as unknown[]) : [];
    const exclude = Array.isArray(data.exclude) ? (data.exclude as unknown[]) : [];
    const roles: BrandRoleAssignment[] = (Array.isArray(data.roles) ? (data.roles as unknown[]) : []).flatMap((item) => {
      const entry = item as { name?: unknown; kind?: unknown; tier?: unknown; description?: unknown };
      if (typeof entry?.name !== "string" || !entry.name.trim() || !isBrandKind(entry.kind)) return [];
      return [{ name: entry.name.trim(), kind: entry.kind, tier: entry.kind === "competitor" && isCompetitorTier(entry.tier) ? entry.tier : undefined, description: typeof entry.description === "string" && entry.description.trim() ? entry.description.trim().slice(0, 120) : undefined }];
    });
    const suggestions: BrandSuggestion[] = (Array.isArray(data.suggestions) ? (data.suggestions as unknown[]) : []).slice(0, MAX_SUGGESTIONS).flatMap((item) => {
      const entry = item as { name?: unknown; tier?: unknown; description?: unknown };
      if (typeof entry?.name !== "string" || !entry.name.trim() || entry.name.length > 60) return [];
      return [{ name: entry.name.trim(), tier: isCompetitorTier(entry.tier) ? entry.tier : undefined, description: typeof entry.description === "string" && entry.description.trim() ? entry.description.trim().slice(0, 120) : undefined }];
    });
    await applyDetectedBrandOptimization({
      ownAliases: ownAliases.filter((item: unknown): item is string => typeof item === "string"),
      competitors: competitors.filter(isOptimizationCompetitor).map((item) => ({
        name: item.name,
        aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias: unknown): alias is string => typeof alias === "string") : [],
        evidenceDomain: typeof item.evidenceDomain === "string" ? item.evidenceDomain : null,
      })),
      exclude: exclude
        .filter(isOptimizationExclusion)
        .map((item) => ({ name: item.name, evidenceDomain: typeof item.evidenceDomain === "string" ? item.evidenceDomain : null })),
      roles,
      suggestions,
    }, tenant.orgId, brandId);
    return NextResponse.json({ ok: true });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name이 필요합니다." }, { status: 400 });
  }

  const payload = { name: body.name.trim(), evidenceDomain: typeof body.evidenceDomain === "string" ? body.evidenceDomain : null };
  if (body.status === "approved") await approveDetectedBrand(payload, tenant.orgId, brandId);
  else if (body.status === "excluded") await excludeDetectedBrand(payload, tenant.orgId, brandId);
  else if (body.status === "competitor_removed") await removeDetectedCompetitor(payload.name, tenant.orgId, brandId);
  else if (body.status === null) await clearDetectedBrandDecision(payload.name, tenant.orgId, brandId);
  else return NextResponse.json({ error: "status는 approved, excluded, competitor_removed, merged, optimized 또는 null이어야 합니다." }, { status: 400 });

  return NextResponse.json({ ok: true });
}
