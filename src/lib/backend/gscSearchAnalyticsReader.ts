import { getGscToken } from "./gscTokenStore";
import { refreshAccessToken } from "./googleOAuth";
import { GscSearchPerformanceResult, GscTrendWeek, GscTopQueryRow, PromptStrategyTopicRow } from "@/lib/db/types";
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

  const [trendRows, queryRows] = await Promise.all([
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

  return { brandId, property: token.property, trend, topQueries };
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

  const rows = await querySearchAnalytics(accessToken, token.property, {
    startDate: isoDate(start),
    endDate: isoDate(end),
    dimensions: ["query"],
    rowLimit: 25,
  });

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
  }));
}

export interface GscTopPage {
  url: string;
  clicks: number;
  impressions: number;
}

// "Citation Attempt" 타겟 URL을 고를 때 쓰는 실제 상위 페이지 목록 —
// 노출은 많은데 클릭이 적은 페이지가 "AI 답변에 인용될 잠재력은 있는데
// 실제로는 잘 안 읽히는" 콘텐츠일 가능성이 높아 우선 후보가 된다.
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
    rowLimit: limit,
  });

  return rows.map((r) => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
}
