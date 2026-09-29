import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { buildSitemapDigest, buildTrendDigest } from "@/lib/backend/strategyDigest";

// 프롬프트 전략의 "검색어 트렌드 분석"·"사이트맵 크롤 분석" 마법사가 프롬프트에 붙일 근거 표를 만든다.
// 데이터랩 호출이 들어 있어 화면을 열 때마다 계산하지 않고, 마법사를 열 때만 부른다.
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "trend" && kind !== "sitemap") {
    return NextResponse.json({ error: "kind는 trend 또는 sitemap이어야 합니다." }, { status: 400 });
  }
  const tenant = await getCurrentTenant();
  const keywords = (request.nextUrl.searchParams.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);
  const result = kind === "trend" ? await buildTrendDigest(tenant, keywords) : await buildSitemapDigest(tenant);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ digest: result.digest, keywords: result.keywords ?? null });
}
