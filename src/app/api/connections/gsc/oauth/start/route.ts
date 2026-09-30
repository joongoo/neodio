import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl, createGoogleOAuthState, GSC_OAUTH_STATE_COOKIE } from "@/lib/backend/googleOAuth";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "brandId가 필요합니다." }, { status: 400 });
  }

  try {
    const tenant = await getCurrentTenant();
    const brand = await getManagedBrand(tenant.orgId, brandId);
    if (!brand) return NextResponse.json({ error: "이 조직의 브랜드가 아닙니다." }, { status: 404 });
    const returnTo = `${tenant.base}/brands-management/${encodeURIComponent(brandId)}/connections`;
    const state = createGoogleOAuthState({ brandId, organizationId: tenant.orgId, returnTo });
    const response = NextResponse.redirect(buildGoogleAuthUrl(state));
    response.cookies.set(GSC_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/api/connections/gsc/oauth/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "설정 오류" }, { status: 500 });
  }
}
