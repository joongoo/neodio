import { PageSpeedResult } from "@/lib/db/types";

// PageSpeed Insights API — GSC OAuth와 무관한 별도 API 키 인증(공개 데이터,
// 브랜드별 연결이 아니라 앱 전체에 키 하나). CrUX 실사용자 필드 데이터가
//있으면 그걸, 트래픽이 적어 없으면 Lighthouse 실험실 추정치를 반환한다.
export async function getRealPageSpeedInsights(
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PageSpeedResult | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) return null;

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("category", "PERFORMANCE");

  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    loadingExperience?: { metrics?: Record<string, { percentile?: number }> };
    originLoadingExperience?: { metrics?: Record<string, { percentile?: number }> };
    lighthouseResult?: { categories?: { performance?: { score?: number } } };
  };

  const fieldMetrics = data.loadingExperience?.metrics;
  const metrics = fieldMetrics ?? data.originLoadingExperience?.metrics;
  const score = data.lighthouseResult?.categories?.performance?.score;

  return {
    url,
    strategy,
    performanceScore: score != null ? Math.round(score * 100) : null,
    lcpMs: metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    cls: metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
    inpMs: metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    hasFieldData: !!fieldMetrics,
    checkedAt: new Date().toISOString(),
  };
}
