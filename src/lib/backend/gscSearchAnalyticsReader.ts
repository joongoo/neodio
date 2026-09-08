import { getGscToken } from "./gscTokenStore";
import { refreshAccessToken } from "./googleOAuth";
import { GscSearchPerformanceResult, GscTrendWeek, GscTopQueryRow } from "@/lib/db/types";

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
