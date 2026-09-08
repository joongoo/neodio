import { GoogleSearchResultRow, NaverSearchResultRow } from "./db";

// Illustrates what a real collector would hand back before normalization,
// derived from the already-normalized seed row (so raw/stored always agree).
// Once a real crawler exists, this raw shape is what it actually returns —
// only the source of `row` changes, not the display below it.
export function rawNaverPayload(row: NaverSearchResultRow) {
  return {
    rank_no: row.rank,
    section: { 블로그: "blog", 카페: "cafe", 파워링크: "powerlink", 쇼핑: "shopping", 지식iN: "kin" }[row.blockType],
    is_ad: row.blockType === "파워링크",
    title_html: `<a href="#">${row.title.replace(/(네오다임|Neodigm)/g, "<b>$1</b>")}</a>`,
    link: `https://${row.url}`,
    desc: row.snippet,
    fetched_at: row.collectedAt,
  };
}

export function rawGooglePayload(row: GoogleSearchResultRow) {
  return {
    position: row.rank,
    result_type: row.isAiOverview ? "ai_overview" : "organic",
    title: row.title,
    link: row.url.startsWith("www.") || row.url.startsWith("google.com") ? `https://${row.url}` : row.url,
    snippet: row.snippet,
    fetched_at: row.collectedAt,
  };
}

export const NORMALIZATION_MAP = [
  { raw: "rank_no / position", stored: "rank", note: "그대로 매핑" },
  { raw: "section / result_type", stored: "blockType / isAiOverview", note: "엔진별 코드값을 공통 블록 유형으로 정규화" },
  { raw: "title_html", stored: "title", note: "HTML 태그 제거" },
  { raw: "link", stored: "url", note: "프로토콜 제거 후 도메인+경로만 저장" },
  { raw: "desc / snippet", stored: "snippet", note: "그대로 매핑" },
  { raw: "(없음 — 브랜드 사전 매칭으로 파생)", stored: "isOwnBrand", note: "title/url을 등록된 브랜드·경쟁사 사전과 매칭해 새로 계산" },
] as const;
