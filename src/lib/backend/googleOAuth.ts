// Minimal Google OAuth 2.0 client — just enough for Search Console's
// read-only Search Analytics API (docs/gsc-search-analytics-plan.md).
// Server-only (reads Client Secret from env) — never import from a
// "use client" file.
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/userinfo.email"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.`);
  return value;
}

// `state`는 어느 브랜드를 연결하는 콜백인지 콜백 라우트가 알 수 있도록
// brandId를 그대로 실어 보낸다 — 세션 없이도 브랜드를 식별할 수 있는 가장
// 단순한 방법.
export function buildGoogleAuthUrl(brandId: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: brandId,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_OAUTH_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth 토큰 교환 실패: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth 토큰 갱신 실패: ${await res.text()}`);
  return res.json();
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

// 인증된 계정이 소유/관리하는 Search Console 속성(property) 목록에서 첫
// 번째 것을 고른다 — 여러 개면 나중에 브랜드 설정 화면에서 고르게 할 수
// 있지만 지금은 가장 흔한 케이스(속성 1개)만 다룬다.
export async function fetchFirstSite(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { siteEntry?: { siteUrl: string }[] };
  return data.siteEntry?.[0]?.siteUrl ?? null;
}
