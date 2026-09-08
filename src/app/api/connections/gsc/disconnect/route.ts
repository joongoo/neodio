import { NextRequest, NextResponse } from "next/server";
import { deleteGscToken } from "@/lib/backend/gscTokenStore";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const brandId = form.get("brandId");
  if (typeof brandId !== "string" || !brandId) {
    return NextResponse.json({ error: "brandId가 필요합니다." }, { status: 400 });
  }
  await deleteGscToken(brandId);
  return NextResponse.redirect(new URL(`/brands-management/${brandId}/connections`, request.url));
}
