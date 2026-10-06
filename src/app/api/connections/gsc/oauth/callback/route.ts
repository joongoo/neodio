import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchSites, fetchUserEmail, findMatchingGscProperty, GSC_OAUTH_STATE_COOKIE, verifyGoogleOAuthState } from "@/lib/backend/googleOAuth";
import { saveGscToken } from "@/lib/backend/gscTokenStore";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { guardApi } from "@/lib/backend/auth/guard";

function redirectAndClear(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.delete(GSC_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (!stateParam) {
    return NextResponse.json({ error: "OAuth state가 없습니다." }, { status: 400 });
  }
  if (request.cookies.get(GSC_OAUTH_STATE_COOKIE)?.value !== stateParam) {
    return NextResponse.json({ error: "OAuth 연결을 시작한 브라우저와 인증 응답이 일치하지 않습니다. 연결을 다시 시작하세요." }, { status: 400 });
  }
  const state = verifyGoogleOAuthState(stateParam);
  if (!state) return NextResponse.json({ error: "OAuth state가 만료되었거나 유효하지 않습니다. 연결을 다시 시작하세요." }, { status: 400 });
  const { brandId, organizationId } = state;
  const backTo = new URL(state.returnTo, request.url);

  if (errorParam || !code) {
    backTo.searchParams.set("gsc_error", errorParam ?? "authorization_failed");
    return redirectAndClear(backTo);
  }

  try {
    const brand = await getManagedBrand(organizationId, brandId);
    if (!brand) {
      backTo.searchParams.set("gsc_error", "brand_not_found");
      return redirectAndClear(backTo);
    }
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google은 이미 한 번 동의한 계정엔 refresh_token을 다시 안 줄 수 있다
      // (prompt=consent로 요청하지만 그래도 발생 가능) — 재연결을 안내한다.
      backTo.searchParams.set("gsc_error", "no_refresh_token");
      return redirectAndClear(backTo);
    }

    const [accountEmail, sites] = await Promise.all([
      fetchUserEmail(tokens.access_token),
      fetchSites(tokens.access_token),
    ]);
    const property = findMatchingGscProperty(sites, brand.url);
    if (!property) {
      backTo.searchParams.set("gsc_error", "matching_property_not_found");
      return redirectAndClear(backTo);
    }

    await saveGscToken({
      organizationId,
      brandId,
      refreshToken: tokens.refresh_token,
      accountEmail: accountEmail ?? "알 수 없음",
      property,
      connectedAt: new Date().toISOString(),
    });

    backTo.searchParams.set("gsc_connected", "1");
    return redirectAndClear(backTo);
  } catch (error) {
    console.error("GSC OAuth callback failed", error);
    backTo.searchParams.set("gsc_error", "oauth_failed");
    return redirectAndClear(backTo);
  }
}
