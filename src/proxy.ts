import { NextRequest, NextResponse } from "next/server";

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

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";
  if (user !== SITE_USER || pass !== password) return unauthorized();

  return NextResponse.next();
}

export const config = {
  // 정적 자산/이미지 최적화 경로는 게이트에서 제외 — 안 그러면 브라우저가
  // Basic Auth 프롬프트를 여러 번 띄우거나 폰트/청크가 깨져 보인다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
