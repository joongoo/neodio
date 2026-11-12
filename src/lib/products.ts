export const PRODUCT_CODES = ["AI_VISIBILITY", "SEARCH_CONTENT", "YOUTUBE"] as const;

export type ProductCode = (typeof PRODUCT_CODES)[number];

export const PRODUCT_LABELS: Record<ProductCode, string> = {
  AI_VISIBILITY: "AI 가시성",
  SEARCH_CONTENT: "검색·콘텐츠",
  YOUTUBE: "YouTube",
};

/**
 * 제품별 tenant 화면의 첫 경로 조각.
 * 홈과 관리 화면은 공통 기능이므로 제품에 포함하지 않는다.
 */
export const PRODUCT_ROUTE_SEGMENTS: Record<ProductCode, readonly string[]> = {
  AI_VISIBILITY: [
    "visibility-overview",
    "brand-presence",
    "prompt-research",
    "prompt-strategy",
    "prompt-library",
    "collection-runs",
    "reports",
  ],
  SEARCH_CONTENT: ["search-trend", "search-performance", "url-inspector", "opportunities"],
  YOUTUBE: ["youtube-aio", "youtube-manage"],
};

const PRODUCT_BY_ROUTE_SEGMENT = new Map<string, ProductCode>(
  PRODUCT_CODES.flatMap((product) => PRODUCT_ROUTE_SEGMENTS[product].map((segment) => [segment, product] as const))
);

/** tenant 기준 상대 경로(`/reports/123`)가 속한 제품. 홈·관리 화면은 null. */
export function productForTenantRoute(route: string): ProductCode | null {
  const segment = route.split("?")[0].split("#")[0].split("/").filter(Boolean)[0];
  return segment ? (PRODUCT_BY_ROUTE_SEGMENT.get(segment) ?? null) : null;
}

export function isProductCode(value: string): value is ProductCode {
  return PRODUCT_CODES.includes(value as ProductCode);
}
