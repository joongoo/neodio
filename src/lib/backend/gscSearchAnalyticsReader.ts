import { getGscToken } from "./gscTokenStore";
import { refreshAccessToken } from "./googleOAuth";
import {
  GscCountryRow,
  GscDeviceRow,
  GscSearchAppearanceRow,
  GscSearchPerformanceResult,
  GscSitemapStatus,
  GscTrendWeek,
  GscTopQueryRow,
  GscUrlIndexStatus,
  PromptStrategyTopicRow,
} from "@/lib/db/types";
import { classifyGscQuery, gscOpportunityScore } from "./gscQueryClassifier";

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  body: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number }
): Promise<SearchAnalyticsRow[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`GSC searchAnalytics.query 실패: ${await res.text()}`);
  const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
  return data.rows ?? [];
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// GSC 데이터는 API상 2~3일 지연이 있으므로(docs/gsc-search-analytics-plan.md
// §1) endDate를 오늘-3일로 잡는다 — 그래야 "데이터 없음" 구간을 안 긁는다.
export async function getRealGscSearchPerformance(brandId: string): Promise<GscSearchPerformanceResult | null> {
  const token = await getGscToken(brandId);
  if (!token) return null;

  const { access_token: accessToken } = await refreshAccessToken(token.refreshToken);

  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - 35); // 5주치

  const [trendRows, queryRows, deviceRows, countryRows] = await Promise.all([
    querySearchAnalytics(accessToken, token.property, {
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: ["date"],
    }),
    querySearchAnalytics(accessToken, token.property, {
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: ["query"],
      rowLimit: 5,
    }),
    // device/country 차원 — 콘텐츠 포맷·마켓 확장 우선순위를 실측으로
    // 뒷받침하는 참고 지표. (docs/gsc-additional-signals.md §3-⑤,⑥)
    querySearchAnalytics(accessToken, token.property, {
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: ["device"],
    }).catch(() => []),
    querySearchAnalytics(accessToken, token.property, {
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: ["country"],
      rowLimit: 5,
    }).catch(() => []),
  ]);

  // 일별 결과를 주 단위로 묶는다 (일요일 시작) — Overview/브랜드 가시성의
  // 주간 표기와 맞추기 위함.
  const weekOf = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return isoDate(d);
  };
  const byWeek = new Map<string, { clicks: number; impressions: number }>();
  for (const row of trendRows) {
    const week = weekOf(row.keys[0]);
    const bucket = byWeek.get(week) ?? { clicks: 0, impressions: 0 };
    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
    byWeek.set(week, bucket);
  }
  const trend: GscTrendWeek[] = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({
      week: new Date(`${week}T00:00:00Z`).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
      clicks: v.clicks,
      impressions: v.impressions,
    }));

  const topQueries: GscTopQueryRow[] = queryRows.map((row, i) => ({
    id: `real-query-${i}`,
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));

  const devices: GscDeviceRow[] = deviceRows
    .map((row) => ({ device: row.keys[0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr }))
    .sort((a, b) => b.impressions - a.impressions);

  const countries: GscCountryRow[] = countryRows
    .map((row) => ({ country: row.keys[0], clicks: row.clicks, impressions: row.impressions }))
    .sort((a, b) => b.impressions - a.impressions);

  return { brandId, property: token.property, trend, topQueries, devices, countries };
}

// 프롬프트 전략의 "GSC 커버리지 공백" — 실제로 노출은 있는데 우리 프롬프트
// 라이브러리엔 없는 검색어를 찾는다. 완전 일치는 기대할 수 없으니(GSC
// 검색어는 사용자가 실제로 타이핑한 짧은 구절이고 라이브러리는 완성된
// 질문 문장이라) "이미 추적 중인 프롬프트 문구에 이 검색어가 부분
// 포함되는지"로 단순 판정한다 — 완벽하진 않지만 완전히 새로운 검색어를
// 놓치는 일은 없다.
export async function getRealGscCoverageGaps(
  brandId: string,
  trackedPrompts: string[]
): Promise<PromptStrategyTopicRow[] | null> {
  const token = await getGscToken(brandId);
  if (!token) return null;

  const { access_token: accessToken } = await refreshAccessToken(token.refreshToken);

  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - 27); // 4주치

  const [rows, queryPageRows] = await Promise.all([
    querySearchAnalytics(accessToken, token.property, {
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: ["query"],
      rowLimit: 25,
    }),
    // ["query","page"] 결합 조회 — 이 검색어가 실제로 어느 페이지로 노출되고
    // 있는지. 커버리지 공백 키워드에 타겟 URL 근거를 붙이는 데 쓴다
    // (docs/gsc-additional-signals.md §3-②).
    querySearchAnalytics(accessToken, token.property, {
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: ["query", "page"],
      rowLimit: 1000,
    }).catch(() => []),
  ]);

  // 검색어별로 클릭이 가장 많은 페이지 하나만 남긴다.
  const topPageByQuery = new Map<string, { page: string; clicks: number }>();
  for (const r of queryPageRows) {
    const [query, page] = r.keys;
    const existing = topPageByQuery.get(query);
    if (!existing || r.clicks > existing.clicks) topPageByQuery.set(query, { page, clicks: r.clicks });
  }

  const trackedLower = trackedPrompts.map((p) => p.toLowerCase());
  // 노출 수만으로 정렬하면 브랜드 검색어("네오다임"/"neodigm")가 항상 상위를
  // 차지한다 — 이건 브랜드 인지도 모니터링 영역이지 GEO 기회가 아니다.
  // Query 유형(브랜드/카테고리/업체 비교 등)별 가중치와 "노출 대비 클릭이
  // 낮음" 신호를 함께 써서 실제 GEO 기회에 가까운 쿼리를 우선한다.
  const gaps = rows
    .filter((r) => r.impressions >= 5)
    .filter((r) => {
      const query = r.keys[0].toLowerCase();
      return !trackedLower.some((p) => p.includes(query) || query.includes(p));
    })
    .sort((a, b) => {
      const scoreA = gscOpportunityScore(a.impressions, a.ctr, classifyGscQuery(a.keys[0]));
      const scoreB = gscOpportunityScore(b.impressions, b.ctr, classifyGscQuery(b.keys[0]));
      return scoreB - scoreA;
    })
    .slice(0, 5);

  return gaps.map((r, i) => ({
    id: `real-gsc-gap-${i}`,
    groupId: "sug-gsc-real",
    topic: r.keys[0],
    market: "KR",
    source: "gsc" as const,
    gscImpressions: r.impressions,
    brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
    gscTopPage: topPageByQuery.get(r.keys[0])?.page,
  }));
}

export interface GscTopPage {
  url: string;
  clicks: number;
  impressions: number;
}

// "Citation Attempt" 타겟 URL을 고를 때 쓰는 실제 상위 페이지 목록 —
// 노출은 많은데 클릭이 적은 페이지가 "AI 답변에 인용될 잠재력은 있는데
// 실제로는 잘 안 읽히는" 콘텐츠일 가능성이 높아 우선 후보가 된다. GSC API
// 자체는 기본적으로 클릭 수 기준으로 정렬해서 주므로, 넉넉히 받아온 뒤
// 우리가 직접 "노출 대비 클릭이 낮은" 순으로 다시 정렬한다.
export async function getRealGscTopPages(brandId: string, limit = 10): Promise<GscTopPage[] | null> {
  const token = await getGscToken(brandId);
  if (!token) return null;

  const { access_token: accessToken } = await refreshAccessToken(token.refreshToken);

  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - 27); // 4주치

  const rows = await querySearchAnalytics(accessToken, token.property, {
    startDate: isoDate(start),
    endDate: isoDate(end),
    dimensions: ["page"],
    rowLimit: 200,
  });

  const MIN_IMPRESSIONS = 20;
  return rows
    .filter((r) => r.impressions >= MIN_IMPRESSIONS)
    .sort((a, b) => a.ctr - b.ctr)
    .slice(0, limit)
    .map((r) => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
}

// URL Inspection API — 우리 자체 크롤 콘텐츠 가시성 점수와 별개로, 구글이
// 실제로 이 URL을 어떻게 보는지(인덱싱 여부/robots.txt 차단/크롤 시각).
// searchAnalytics.query와 다른 엔드포인트(Search Console API v1)라 별도
// 함수로 둔다 — 같은 webmasters.readonly 스코프로 호출 가능.
// (docs/gsc-additional-signals.md §3-①)
export async function getRealGscUrlIndexStatus(brandId: string, url: string): Promise<GscUrlIndexStatus | null> {
  const token = await getGscToken(brandId);
  if (!token) return null;

  const { access_token: accessToken } = await refreshAccessToken(token.refreshToken);

  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: token.property }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    inspectionResult?: {
      indexStatusResult?: {
        verdict?: string;
        coverageState?: string;
        robotsTxtState?: string;
        indexingState?: string;
        lastCrawlTime?: string;
        pageFetchState?: string;
        googleCanonical?: string;
        userCanonical?: string;
        sitemap?: string[];
      };
    };
  };
  const result = data.inspectionResult?.indexStatusResult;
  if (!result) return null;

  return {
    url,
    verdict: result.verdict ?? "VERDICT_UNSPECIFIED",
    coverageState: result.coverageState ?? "",
    robotsTxtState: result.robotsTxtState ?? "",
    indexingState: result.indexingState ?? "",
    lastCrawlTime: result.lastCrawlTime ?? null,
    pageFetchState: result.pageFetchState ?? "",
    googleCanonical: result.googleCanonical ?? null,
    userCanonical: result.userCanonical ?? null,
    sitemaps: result.sitemap ?? [],
    checkedAt: new Date().toISOString(),
  };
}

// searchAnalytics.query의 searchAppearance 차원 — FAQ/사이트링크 같은 리치
// 결과 유형별 실적. "FAQ 추가"/"목차 추가" 기회를 실행한 뒤 실제로 검색결과가
// 개선됐는지 확인하는 근거로 쓴다. (docs/gsc-additional-signals.md §3-③)
export async function getRealGscSearchAppearance(brandId: string): Promise<GscSearchAppearanceRow[] | null> {
  const token = await getGscToken(brandId);
  if (!token) return null;

  const { access_token: accessToken } = await refreshAccessToken(token.refreshToken);

  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setDate(start.getDate() - 27); // 4주치

  const rows = await querySearchAnalytics(accessToken, token.property, {
    startDate: isoDate(start),
    endDate: isoDate(end),
    dimensions: ["searchAppearance"],
  });
  if (rows.length === 0) return null;

  return rows.map((r) => ({ appearance: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
}

// Sitemaps API — 제출한 사이트맵별 구글 처리 현황(경고/에러/타입별 제출-인덱싱
// 수). robots.txt 차단 진단 옆에 나란히 둘 정량 지표로 쓴다.
// (docs/gsc-additional-signals.md §3-④)
export async function getRealGscSitemaps(brandId: string): Promise<GscSitemapStatus[] | null> {
  const token = await getGscToken(brandId);
  if (!token) return null;

  const { access_token: accessToken } = await refreshAccessToken(token.refreshToken);

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(token.property)}/sitemaps`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    sitemap?: {
      path?: string;
      lastSubmitted?: string;
      lastDownloaded?: string;
      isPending?: boolean;
      isSitemapsIndex?: boolean;
      warnings?: string;
      errors?: string;
      contents?: { type?: string; submitted?: string; indexed?: string }[];
    }[];
  };
  const list = data.sitemap ?? [];
  if (list.length === 0) return null;

  return list.map((s) => ({
    path: s.path ?? "",
    lastSubmitted: s.lastSubmitted ?? null,
    lastDownloaded: s.lastDownloaded ?? null,
    isPending: !!s.isPending,
    isSitemapsIndex: !!s.isSitemapsIndex,
    warnings: Number(s.warnings ?? 0),
    errors: Number(s.errors ?? 0),
    contents: (s.contents ?? []).map((c) => ({
      type: c.type ?? "",
      submitted: Number(c.submitted ?? 0),
      indexed: Number(c.indexed ?? 0),
    })),
  }));
}
