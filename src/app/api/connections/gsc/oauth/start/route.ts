import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/backend/googleOAuth";

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "brandId가 필요합니다." }, { status: 400 });
  }

  try {
    return NextResponse.redirect(buildGoogleAuthUrl(brandId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "설정 오류" }, { status: 500 });
  }
}
