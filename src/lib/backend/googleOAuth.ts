import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Minimal Google OAuth 2.0 client — just enough for Search Console's
// read-only Search Analytics API (docs/gsc-search-analytics-plan.md).
// Server-only (reads Client Secret from env) — never import from a
// "use client" file.
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/userinfo.email"];
export const GSC_OAUTH_STATE_COOKIE = "neodio-gsc-oauth-state";

export interface GoogleOAuthState {
  brandId: string;
  organizationId: string;
  returnTo: string;
  expiresAt: number;
  nonce: string;
}

export interface GscSite {
  siteUrl: string;
  permissionLevel?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.`);
  return value;
}

function sign(value: string): string {
  // OAuth client secret은 서버에만 있으며 모든 배포 인스턴스에서 같다.
  // state에 서명하면 별도의 세션 저장소 없이도 브랜드 ID 위변조와
  // OAuth login CSRF를 막을 수 있다.
  return createHmac("sha256", requireEnv("GOOGLE_OAUTH_CLIENT_SECRET")).update(value).digest("base64url");
}

export function createGoogleOAuthState(input: Omit<GoogleOAuthState, "expiresAt" | "nonce">): string {
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString("base64url") })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyGoogleOAuthState(state: string): GoogleOAuthState | null {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<GoogleOAuthState>;
    if (!parsed.brandId || !parsed.organizationId || !parsed.returnTo || !parsed.expiresAt || !parsed.nonce || parsed.expiresAt < Date.now()) return null;
    if (!parsed.returnTo.startsWith("/") || parsed.returnTo.startsWith("//")) return null;
    return parsed as GoogleOAuthState;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
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

export async function fetchSites(accessToken: string): Promise<GscSite[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GSC 속성 목록 조회 실패: ${res.status}`);
  const data = (await res.json()) as { siteEntry?: GscSite[] };
  return data.siteEntry ?? [];
}

function normalizedHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** 도메인 속성을 우선하고, 그다음으로 같은 호스트의 URL-prefix 속성을 고른다. */
export function findMatchingGscProperty(sites: GscSite[], brandUrl: string): string | null {
  const brandHost = normalizedHost(brandUrl);
  if (!brandHost) return null;

  const domainProperty = sites.find(({ siteUrl }) => {
    if (!siteUrl.startsWith("sc-domain:")) return false;
    return siteUrl.slice("sc-domain:".length).toLowerCase().replace(/^www\./, "").replace(/\.$/, "") === brandHost;
  });
  if (domainProperty) return domainProperty.siteUrl;

  const brandOrigin = (() => {
    try {
      const url = new URL(brandUrl);
      return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
      return null;
    }
  })();
  const urlProperties = sites.filter(({ siteUrl }) => !siteUrl.startsWith("sc-domain:") && normalizedHost(siteUrl) === brandHost);
  const exactOrigin = urlProperties.find(({ siteUrl }) => {
    try {
      return new URL(siteUrl).origin.toLowerCase() === brandOrigin;
    } catch {
      return false;
    }
  });
  return exactOrigin?.siteUrl ?? urlProperties[0]?.siteUrl ?? null;
}
