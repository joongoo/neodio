import { NextRequest, NextResponse } from "next/server";
import { createManagedBrand } from "@/lib/backend/brandsManagementStore";
import { ManagedBrand } from "@/lib/db/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!name || !url) {
    return NextResponse.json({ error: "브랜드 이름과 URL은 필수입니다." }, { status: 400 });
  }

  const brand: Omit<ManagedBrand, "id"> = {
    name,
    url,
    sitemapUrl: typeof body?.sitemapUrl === "string" ? body.sitemapUrl.trim() : "",
    description: typeof body?.description === "string" ? body.description.trim() : "",
    industry: typeof body?.industry === "string" ? body.industry.trim() : "",
    markets: Array.isArray(body?.markets) ? body.markets.filter((m: unknown): m is string => typeof m === "string") : [],
    status: "pending",
    aliases: [],
    otherBrands: [],
    urls: [],
    socialAccounts: [],
    earnedContentSources: [],
    cdnConnected: false,
    gscConnected: false,
    analyticsConnected: false,
  };

  const created = await createManagedBrand(brand);
  return NextResponse.json({ brand: created });
}
