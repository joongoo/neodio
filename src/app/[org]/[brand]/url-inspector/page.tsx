import { UrlInspectorClient } from "@/components/url-inspector/UrlInspectorClient";
import { db } from "@/lib/db";
import { getRealUrlInspectorData } from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getRegisteredUrls } from "@/lib/backend/registeredUrls";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getLatestSitemapCrawl } from "@/lib/backend/sitemapCrawlReader";
import { buildCitationFeatureAnalysis } from "@/lib/citationFeatures";
import { EMPTY_URL_INSPECTOR } from "@/lib/db/data/emptyOrg";

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function UrlInspectorPage() {
  const tenant = await getCurrentTenant();
  const [demo, data, registeredUrls] = await Promise.all([
    isDemoMode(),
    db.urlInspector.get(tenant.orgId).then((d) => d ?? EMPTY_URL_INSPECTOR),
    getRegisteredUrls(tenant.orgId).catch(() => [] as string[]),
  ]);
  if (!data) return null;

  const real = demo ? null : await getRealUrlInspectorData().catch(() => null);
  const merged = real ?? data;

  // 아직 한 번도 인용 안 된 URL도 "추적하고 싶다"고 등록해두면 0건인 채로
  // 표에 남아있게 한다 — 실측 인용이 있는 URL만 보이던 것의 보완.
  const existingUrls = new Set(merged.ownUrls.map((u) => u.url));
  const extraRows = registeredUrls
    .filter((url) => !existingUrls.has(url))
    .map((url, i) => ({
      id: `registered-${i}`,
      url,
      citations: 0,
      citedPrompts: 0,
      citedPromptTitles: [],
      contentVisibility: null,
      category: "미분류",
      market: "—",
    }));

  // 크롤한 페이지 속성 × 실제 인용 — 실 데이터(인용·크롤)가 모두 있을 때만.
  const org = await tenant.org;
  const latestCrawl = demo || !real ? null : await getLatestSitemapCrawl(org.domain).catch(() => null);
  const featureAnalysis = latestCrawl
    ? buildCitationFeatureAnalysis(latestCrawl.urls, real!.ownUrls.filter((u) => u.citations > 0).map((u) => u.url))
    : null;

  return <UrlInspectorClient data={{ ...merged, ownUrls: [...merged.ownUrls, ...extraRows] }} featureAnalysis={featureAnalysis} />;
}
