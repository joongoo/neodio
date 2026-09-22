import { NextRequest, NextResponse } from "next/server";
import {
  applyDetectedBrandOptimization,
  approveDetectedBrand,
  clearDetectedBrandDecision,
  excludeDetectedBrand,
  mergeDetectedBrands,
  removeDetectedCompetitor,
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
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
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
      mergeTarget
    );
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
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name이 필요합니다." }, { status: 400 });
  }

  const payload = { name: body.name.trim(), evidenceDomain: typeof body.evidenceDomain === "string" ? body.evidenceDomain : null };
  if (body.status === "approved") await approveDetectedBrand(payload);
  else if (body.status === "excluded") await excludeDetectedBrand(payload);
  else if (body.status === "competitor_removed") await removeDetectedCompetitor(payload.name);
  else if (body.status === null) await clearDetectedBrandDecision(payload.name);
  else return NextResponse.json({ error: "status는 approved, excluded, competitor_removed, merged, optimized 또는 null이어야 합니다." }, { status: 400 });

  return NextResponse.json({ ok: true });
}
