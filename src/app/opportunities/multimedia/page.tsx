import { ContentAuditClient } from "@/components/opportunities/ContentAuditClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { buildMultimediaOpportunity, getSitemapCrawlHistory } from "@/lib/backend/sitemapCrawlReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getExcludedUrls } from "@/lib/backend/contentAuditExclusions";
import { getLlmBridgeScope } from "@/lib/backend/llmBridgeStore";
import { getCachedUrlIndexStatuses } from "@/lib/backend/gscUrlInspectionStore";
import { getCachedPageSpeedResults } from "@/lib/backend/pageSpeedInsightsStore";

export const dynamic = "force-dynamic";

export default async function MultimediaOpportunityPage() {
  const [org, demo, excludedUrls] = await Promise.all([db.organizations.get(DEFAULT_ORG_ID), isDemoMode(), getExcludedUrls("multimedia")]);
  const history = demo || !org ? [] : await getSitemapCrawlHistory(org.domain).catch(() => []);
  const data = buildMultimediaOpportunity(history, excludedUrls);

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-sm text-neutral-500">
        아직 크롤 데이터가 없습니다. 브랜드 관리에서 사이트맵 크롤을 실행하면 이 기회가 채워집니다.
      </div>
    );
  }

  const [guides, indexStatuses, pageSpeedResults] = await Promise.all([
    getLlmBridgeScope<{ guide: string }>("content-guide-multimedia"),
    getCachedUrlIndexStatuses(),
    getCachedPageSpeedResults(),
  ]);
  const dataWithExtras = {
    ...data,
    urls: data.urls.map((u) => ({
      ...u,
      guide: guides[u.url]?.guide,
      googleIndex: indexStatuses[u.url],
      pageSpeed: pageSpeedResults[u.url],
    })),
  };

  return <ContentAuditClient data={dataWithExtras} domain={org?.domain ?? ""} />;
}
