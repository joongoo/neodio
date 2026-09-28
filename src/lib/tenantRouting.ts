import { RESERVED_ORG_SLUGS } from "./slug";

// 주소 → 조직·브랜드 해석 규칙 (src/proxy.ts가 쓴다). URL이 조직·브랜드의
// 기준이다: /{조직}/{브랜드}/{화면}. 프록시와 분리해 순수 함수로 두고 테스트한다.
//
// - /{조직}/{브랜드}/…  → 화면. 조직·브랜드를 서버에 넘기고 "마지막 위치"로 기억
// - /api/…             → 호출한 화면 주소(Referer)의 조직·브랜드, 없으면 마지막 위치.
//                         탭마다 다른 조직을 봐도 API가 섞이지 않는다.
// - 예전 주소(/youtube-aio 등, 조직·브랜드 없음) → 호출한 화면 또는 마지막 위치의
//   같은 화면으로 보낸다(예전 링크·북마크·서버 리다이렉트 호환)
// - /help, /organizations, 정적 파일 → 그대로

export const TENANT_COOKIE = "neodio-tenant";
export const TENANT_HEADERS = { org: "x-neodio-org", brand: "x-neodio-brand", source: "x-neodio-tenant-source" } as const;

/** 조직·브랜드와 무관한 최상위 경로 */
const GLOBAL_SEGMENTS = new Set(["api", "help", "organizations", "_next", "favicon.ico"]);

export interface TenantRef {
  org: string;
  brand: string | null;
}

export type TenantRoute =
  | { kind: "pass" }
  | { kind: "tenant"; tenant: TenantRef }
  | { kind: "api"; tenant: TenantRef | null; source: "referer" | "cookie" | "none" }
  | { kind: "redirect"; to: string };

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** /{조직}/{브랜드}/… 모양의 경로에서 조직·브랜드를 꺼낸다. */
export function tenantFromPath(pathname: string): TenantRef | null {
  const [org, brand] = segments(pathname);
  if (!org || GLOBAL_SEGMENTS.has(org) || RESERVED_ORG_SLUGS.has(org) || org.includes(".")) return null;
  return { org: decodeURIComponent(org), brand: brand ? decodeURIComponent(brand) : null };
}

function tenantFromReferer(referer: string | null): TenantRef | null {
  if (!referer) return null;
  try {
    const tenant = tenantFromPath(new URL(referer).pathname);
    return tenant?.brand ? tenant : null;
  } catch {
    return null;
  }
}

export function tenantFromCookie(value: string | null | undefined): TenantRef | null {
  if (!value) return null;
  const [org, brand] = decodeURIComponent(value).split("/");
  return org && brand ? { org, brand } : null;
}

export function tenantCookieValue(tenant: TenantRef): string {
  return encodeURIComponent(`${tenant.org}/${tenant.brand}`);
}

export function resolveTenantRoute(pathname: string, search: string, referer: string | null, cookie: string | null): TenantRoute {
  const [first] = segments(pathname);
  if (!first) return { kind: "pass" }; // "/" — 루트 페이지가 마지막 위치로 보낸다

  if (first === "api") {
    const fromReferer = tenantFromReferer(referer);
    if (fromReferer) return { kind: "api", tenant: fromReferer, source: "referer" };
    const fromCookie = tenantFromCookie(cookie);
    return fromCookie ? { kind: "api", tenant: fromCookie, source: "cookie" } : { kind: "api", tenant: null, source: "none" };
  }
  if (GLOBAL_SEGMENTS.has(first) || first.includes(".")) return { kind: "pass" };

  if (RESERVED_ORG_SLUGS.has(first)) {
    const target = tenantFromReferer(referer) ?? tenantFromCookie(cookie);
    if (!target) return { kind: "redirect", to: `/?next=${encodeURIComponent(pathname + search)}` };
    return { kind: "redirect", to: `/${encodeURIComponent(target.org)}/${encodeURIComponent(target.brand!)}${pathname}${search}` };
  }

  return { kind: "tenant", tenant: tenantFromPath(pathname)! };
}
