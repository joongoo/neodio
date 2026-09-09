import { NextRequest, NextResponse } from "next/server";
import { deleteManagedBrand, updateManagedBrand } from "@/lib/backend/brandsManagementStore";
import { ManagedBrand } from "@/lib/db/types";

const PATCHABLE_KEYS: (keyof ManagedBrand)[] = [
  "name",
  "sitemapUrl",
  "description",
  "industry",
  "markets",
  "status",
  "aliases",
  "otherBrands",
  "urls",
  "socialAccounts",
  "earnedContentSources",
  "cdnConnected",
  "gscConnected",
  "analyticsConnected",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const patch: Partial<ManagedBrand> = {};
  for (const key of PATCHABLE_KEYS) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  if (patch.status !== undefined && patch.status !== "active" && patch.status !== "pending") {
    return NextResponse.json({ error: "status는 active 또는 pending이어야 합니다." }, { status: 400 });
  }

  await updateManagedBrand(brandId, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await deleteManagedBrand(brandId);
  return NextResponse.json({ ok: true });
}
