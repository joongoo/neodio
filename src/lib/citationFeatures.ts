import type { SitemapCrawlUrlResult } from "@/lib/db/types";

// "AI에게 인용되는 페이지는 어떤 특징이 있는가" — 사이트맵 크롤로 잰 페이지 속성과
// 실제 인용 URL을 조인해, 속성이 있는 페이지와 없는 페이지의 인용률을 비교한다.
// 상관관계일 뿐 인과가 아니고 페이지 수가 적으면 흔들리므로, 화면에서 표본 수를 같이 보여준다.

export interface FeatureGroup {
  pages: number;
  cited: number;
}

export interface FeatureLift {
  id: string;
  label: string;
  withFeature: FeatureGroup;
  withoutFeature: FeatureGroup;
  /** 있는 쪽 인용률 − 없는 쪽 인용률(%p). 한쪽 그룹이 비면 null. */
  liftPoints: number | null;
}

export interface CitationFeatureAnalysis {
  totalPages: number;
  citedPages: number;
  features: FeatureLift[];
}

const MIN_PAGES = 5;

/** 크롤 URL과 인용 URL을 같은 키로 맞춘다 — www·끝 슬래시·쿼리·해시·대소문자 차이를 무시. */
export function urlKey(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

const FEATURES: { id: string; label: string; test: (u: SitemapCrawlUrlResult) => boolean | undefined }[] = [
  { id: "faq", label: "FAQ 있음", test: (u) => u.hasFaq },
  { id: "toc", label: "목차 있음", test: (u) => u.hasToc },
  { id: "structured-data", label: "구조화 데이터(JSON-LD) 있음", test: (u) => u.hasStructuredData },
  { id: "alt", label: "이미지 대체 텍스트 80% 이상", test: (u) => (u.imageAltCoverage === undefined ? undefined : u.imageAltCoverage >= 80) },
  { id: "readable", label: "읽기 쉬운 문장(복잡도 점수 60 이상)", test: (u) => (u.complexityScore === undefined ? undefined : u.complexityScore >= 60) },
  { id: "visible", label: "AI가 읽을 수 있는 콘텐츠 70% 이상", test: (u) => u.contentVisibility >= 70 },
];

export function buildCitationFeatureAnalysis(crawlUrls: SitemapCrawlUrlResult[], citedUrls: string[]): CitationFeatureAnalysis | null {
  const pages = crawlUrls.filter((u) => u.status === "success");
  if (pages.length < MIN_PAGES) return null;
  const cited = new Set(citedUrls.map(urlKey));
  const isCited = (u: SitemapCrawlUrlResult) => cited.has(urlKey(u.url));
  const citedPages = pages.filter(isCited).length;
  if (citedPages === 0) return null;

  const features: FeatureLift[] = FEATURES.flatMap(({ id, label, test }) => {
    const withFeature: FeatureGroup = { pages: 0, cited: 0 };
    const withoutFeature: FeatureGroup = { pages: 0, cited: 0 };
    for (const page of pages) {
      const has = test(page);
      if (has === undefined) continue; // 이 속성을 아직 측정하지 않은 크롤 기록
      const group = has ? withFeature : withoutFeature;
      group.pages += 1;
      if (isCited(page)) group.cited += 1;
    }
    if (withFeature.pages + withoutFeature.pages === 0) return [];
    const rate = (g: FeatureGroup) => (g.pages > 0 ? (g.cited / g.pages) * 100 : null);
    const w = rate(withFeature);
    const wo = rate(withoutFeature);
    return [{ id, label, withFeature, withoutFeature, liftPoints: w !== null && wo !== null ? Math.round(w - wo) : null }];
  });
  return { totalPages: pages.length, citedPages, features };
}
