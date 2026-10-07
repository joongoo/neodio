// URL의 조직·브랜드 구분자(슬러그) 규칙 — /{조직}/{브랜드}/{화면}.
// 조직 슬러그는 조직 관리에서 사람이 정하고, 브랜드 슬러그는 브랜드 이름이
// 한글이거나 띄어쓰기가 있을 수 있어 브랜드의 기본 URL(도메인)에서 만든다.
// 서버·클라이언트·프록시가 모두 쓰므로 외부 의존 없는 순수 함수만 둔다.

/** 앱의 최상위 경로 — 조직 슬러그로 쓰면 그 화면과 겹친다. */
export const RESERVED_ORG_SLUGS = new Set([
  "api",
  "help",
  "organizations",
  "users",
  "login",
  "signup",
  "pending",
  "account",
  "_next",
  "favicon.ico",
  // 조직·브랜드가 URL에 들어가기 전의 화면 주소 — 예전 링크를 새 주소로 보내는 데 쓴다.
  "visibility-overview",
  "prompt-research",
  "search-trend",
  "search-performance",
  "youtube-aio",
  "youtube-manage",
  "collection-runs",
  "prompt-strategy",
  "prompt-library",
  "brand-presence",
  "url-inspector",
  "opportunities",
  "brands-management",
]);

/** 조직에 브랜드가 하나도 없을 때 URL의 브랜드 자리 */
export const NO_BRAND_SLUG = "-";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** 사용자가 입력한 조직 슬러그 검증 — 통과하면 null, 아니면 오류 문구 */
export function orgSlugError(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) return "슬러그는 영문 소문자·숫자·하이픈(-)으로 2~40자, 하이픈으로 시작·끝날 수 없습니다.";
  if (RESERVED_ORG_SLUGS.has(slug)) return `"${slug}"는 앱 화면 주소와 겹쳐 쓸 수 없습니다.`;
  return null;
}

/** 이름에서 슬러그 후보를 만든다(영문·숫자만 남김) — 기존 조직의 슬러그를 채울 때 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

// 두 단계 국가 도메인(neodigm.co.kr, example.com.au)의 두 번째 단계
const SECOND_LEVEL = new Set(["co", "com", "or", "ne", "go", "ac", "net", "org", "gov", "edu", "re", "pe"]);

/**
 * 브랜드 기본 URL → 슬러그. www와 최상위 도메인(국가 2단계 포함)을 떼고 남은
 * 라벨을 하이픈으로 잇는다: salesforce.com → salesforce, neodigm.co.kr → neodigm,
 * blog.neodigm.com → blog-neodigm.
 */
export function brandSlugFromUrl(url: string): string {
  let host: string;
  try {
    host = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return "";
  }
  const labels = host.replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length > 1) labels.pop();
  if (labels.length > 1 && labels[labels.length - 1].length <= 3 && SECOND_LEVEL.has(labels[labels.length - 1])) labels.pop();
  return slugifyName(labels.join("-"));
}

/**
 * 조직 안 브랜드들의 슬러그 — 먼저 만든 브랜드가 기본 슬러그를 갖고, 같은
 * 도메인이 또 있으면 -2, -3…을 붙인다. "Demo"(목업 시연 브랜드)는 "demo".
 * brands는 만든 순서대로 넘긴다(listBrands가 created_at 순).
 */
export function assignBrandSlugs<T extends { id: string; name: string; url: string }>(brands: T[]): Map<string, string> {
  const used = new Set<string>([NO_BRAND_SLUG]);
  const slugs = new Map<string, string>();
  for (const brand of brands) {
    const base = brand.name === "Demo" ? "demo" : brandSlugFromUrl(brand.url) || slugifyName(brand.name) || "brand";
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    slugs.set(brand.id, slug);
  }
  return slugs;
}
