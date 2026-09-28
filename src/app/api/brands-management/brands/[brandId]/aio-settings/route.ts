import { NextRequest, NextResponse } from "next/server";
import { getBrandAioSettings, saveBrandAioSettings, validateAioSettings } from "@/lib/backend/brandAioConfig";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const tenant = await getCurrentTenant();
  const { brandId } = await params;
  if (!(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  const settings = validateAioSettings(await request.json().catch(() => null));
  if (typeof settings === "string") return NextResponse.json({ error: settings }, { status: 400 });

  await saveBrandAioSettings(brandId, settings);
  return NextResponse.json({ settings: await getBrandAioSettings(brandId) });
}
