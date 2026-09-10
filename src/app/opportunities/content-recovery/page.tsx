import { ContentRecoveryClient } from "@/components/opportunities/ContentRecoveryClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { buildContentRecoveryFromCrawlHistory, getSitemapCrawlHistory } from "@/lib/backend/sitemapCrawlReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getLlmBridgeScope } from "@/lib/backend/llmBridgeStore";
import { getCachedUrlIndexStatuses } from "@/lib/backend/gscUrlInspectionStore";
import { getCachedPageSpeedResults } from "@/lib/backend/pageSpeedInsightsStore";

// 실 사이트맵 크롤 기록(.tmp/sitemap-crawl)이 새로 생길 수 있으므로
// 캐시하지 않는다.
export const dynamic = "force-dynamic";

// Matches Figma "Opportunity Detail - Content Recovery (Template C)" (node
// 646:15046). Content-visibility scoring comes from our own Playwright
// crawl (rendered vs raw HTML), no 3rd-party data (neodigm_p0_scope.md §2).
// 배포(엣지 딜리버리)는 우리 인프라에 없어 제외 — 대신 같은 크롤을 반복
// 실행해서 얻는 전/후 비교만 지원한다.
export default async function ContentRecoveryOpportunityPage() {
  const [org, mockData, demo] = await Promise.all([
    db.organizations.get(DEFAULT_ORG_ID),
    db.opportunities.getContentRecovery(DEFAULT_ORG_ID),
    isDemoMode(),
  ]);

  const history = demo || !org ? [] : await getSitemapCrawlHistory(org.domain).catch(() => []);
  const real = buildContentRecoveryFromCrawlHistory(history);
  const data = real ?? mockData;
  if (!data) return null;

  // LLM API 연동 전까지 "DB 등록" 모달로 사람이 채운 URL별 수정 가이드 +
  // URL Inspection API로 마지막에 확인해둔 구글 인덱싱 상태(캐시).
  const [guides, indexStatuses, pageSpeedResults] = await Promise.all([
    getLlmBridgeScope<{ guide: string }>("content-guide-content-recovery"),
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

  return <ContentRecoveryClient data={dataWithExtras} domain={org?.domain ?? ""} />;
}
