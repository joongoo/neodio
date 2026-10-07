import { NextRequest, NextResponse } from "next/server";
import { resolveTenantRoute, TENANT_COOKIE, TENANT_HEADERS, tenantCookieValue } from "@/lib/tenantRouting";

// 프로덕션 URL에 접근 제어가 전혀 없어서 URL만 알면 누구나 브랜드 데이터를
// 보고 고칠 수 있었다 (docs/production-readiness-checklist.md P0). 별도
// 인증 서비스를 붙이기 전, HTTP Basic Auth로 최소한의 게이트를 건다.
// SITE_PASSWORD가 설정 안 돼 있으면(로컬 dev) 그냥 통과 — 로컬 개발까지
// 막을 필요는 없다.
const SITE_USER = "neodigm";

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="neodio"' },
  });
}

function authorized(request: NextRequest): boolean {
  const password = process.env.SITE_PASSWORD;
  if (!password) return true;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";
  return user === SITE_USER && pass === password;
}

// 조직·브랜드는 URL이 기준이다(/{조직}/{브랜드}/{화면}, src/lib/tenantRouting.ts).
// 여기서 해석해 서버(src/lib/backend/tenant.ts)에 요청 헤더로 넘긴다 — 클라이언트가
// 같은 이름의 헤더를 보내도 항상 지우고 다시 쓴다. 나중에 사용자 권한이 생기면
// "이 사용자가 이 조직을 볼 수 있는가"도 이 자리에서 막으면 된다.
// 로그인 체계(AUTH_ENABLED=true)에서 로그인 없이 볼 수 있는 경로
// 소개·개인정보처리방침·서비스 약관은 Google OAuth 동의 화면에 등록하는 공개 주소라 로그인 없이 열려야 한다.
const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup", "/about", "/privacy", "/terms"];
const isPublicPath = (pathname: string) => PUBLIC_PATHS.includes(pathname);

export default function proxy(request: NextRequest) {
  if (!authorized(request)) return unauthorized();

  // 로그인이 켜져 있으면 세션 쿠키가 없는 요청은 로그인으로 보낸다(쿠키 값의 유효성은 서버가 DB로 확인한다 —
  // 여기서는 "쿠키가 있는가"만 본다). API는 리다이렉트 대신 401을 준다.
  if (process.env.AUTH_ENABLED === "true" && !isPublicPath(request.nextUrl.pathname) && !request.cookies.get("neodio-session")?.value) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const route = resolveTenantRoute(
    request.nextUrl.pathname,
    request.nextUrl.search,
    request.headers.get("referer"),
    request.cookies.get(TENANT_COOKIE)?.value ?? null
  );
  if (route.kind === "redirect") return NextResponse.redirect(new URL(route.to, request.url));

  const headers = new Headers(request.headers);
  for (const name of Object.values(TENANT_HEADERS)) headers.delete(name);
  const passed = route.kind === "tenant" ? { tenant: route.tenant, source: "path" } : route.kind === "api" ? route : null;
  if (passed?.tenant) {
    headers.set(TENANT_HEADERS.org, passed.tenant.org);
    if (passed.tenant.brand) headers.set(TENANT_HEADERS.brand, passed.tenant.brand);
    headers.set(TENANT_HEADERS.source, passed.source);
  }
  const response = NextResponse.next({ request: { headers } });
  // 마지막으로 본 조직·브랜드 — 예전 주소와 조직 무관 화면(/help 등)이 이걸로 돌아온다.
  if (route.kind === "tenant" && route.tenant.brand) {
    response.cookies.set(TENANT_COOKIE, tenantCookieValue(route.tenant), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // 정적 자산/이미지 최적화 경로는 게이트에서 제외 — 안 그러면 브라우저가
  // Basic Auth 프롬프트를 여러 번 띄우거나 폰트/청크가 깨져 보인다.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|neodio(?:-192|-512)?\\.png$|icon\\.png$|apple-icon\\.png$|opengraph-image\\.png$|manifest\\.webmanifest$).*)"],
};
