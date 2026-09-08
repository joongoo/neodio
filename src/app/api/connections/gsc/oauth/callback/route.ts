import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchFirstSite, fetchUserEmail } from "@/lib/backend/googleOAuth";
import { saveGscToken } from "@/lib/backend/gscTokenStore";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const brandId = request.nextUrl.searchParams.get("state");
  const errorParam = request.nextUrl.searchParams.get("error");

  if (!brandId) {
    return NextResponse.json({ error: "state(brandId)가 없습니다." }, { status: 400 });
  }
  const backTo = new URL(`/brands-management/${brandId}/connections`, request.url);

  if (errorParam || !code) {
    backTo.searchParams.set("gsc_error", errorParam ?? "authorization_failed");
    return NextResponse.redirect(backTo);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google은 이미 한 번 동의한 계정엔 refresh_token을 다시 안 줄 수 있다
      // (prompt=consent로 요청하지만 그래도 발생 가능) — 재연결을 안내한다.
      backTo.searchParams.set("gsc_error", "no_refresh_token");
      return NextResponse.redirect(backTo);
    }

    const [accountEmail, property] = await Promise.all([
      fetchUserEmail(tokens.access_token),
      fetchFirstSite(tokens.access_token),
    ]);

    await saveGscToken({
      brandId,
      refreshToken: tokens.refresh_token,
      accountEmail: accountEmail ?? "알 수 없음",
      property: property ?? "(연결된 속성 없음)",
      connectedAt: new Date().toISOString(),
    });

    backTo.searchParams.set("gsc_connected", "1");
    return NextResponse.redirect(backTo);
  } catch (error) {
    backTo.searchParams.set("gsc_error", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.redirect(backTo);
  }
}
