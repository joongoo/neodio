import { NextRequest, NextResponse } from "next/server";
import { deleteManagedBrand, updateManagedBrand } from "@/lib/backend/brandsManagementStore";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { ManagedBrand } from "@/lib/db/types";
import { guardApi } from "@/lib/backend/auth/guard";

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
  const denied = await guardApi("write", { brandId });
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const patch: Partial<ManagedBrand> = {};
  for (const key of PATCHABLE_KEYS) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  if (typeof patch.sitemapUrl === "string") patch.sitemapUrl = normalizeUrl(patch.sitemapUrl);
  if (patch.status !== undefined && patch.status !== "active" && patch.status !== "pending") {
    return NextResponse.json({ error: "status는 active 또는 pending이어야 합니다." }, { status: 400 });
  }

  await updateManagedBrand(brandId, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const { brandId } = await params;
  await deleteManagedBrand(brandId);
  return NextResponse.json({ ok: true });
}
