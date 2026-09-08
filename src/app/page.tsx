import { ArrowUpRight, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SentimentChart } from "@/components/charts/SentimentChart";
import { MarketComparisonChart } from "@/components/charts/MarketComparisonChart";
import { TrafficTrendChart } from "@/components/charts/TrafficTrendChart";
import { RangeDropdown } from "@/components/overview/RangeDropdown";
import { FilterDropdown } from "@/components/overview/FilterDropdown";
import { ChecklistCard } from "@/components/overview/ChecklistCard";
import { ChartPanel } from "@/components/overview/ChartPanel";
import { ContentVisibilityCard } from "@/components/overview/ContentVisibilityCard";
import { StatCard } from "@/components/overview/StatCard";
import { DateRange, DEFAULT_ORG_ID, db } from "@/lib/db";
import {
  buildContentVisibilityFromCrawl,
  buildEmptyContentVisibility,
  getLatestSitemapCrawl,
} from "@/lib/backend/sitemapCrawlReader";
import { getRealMarketComparison, getRealSentimentSeries, getRealStatSeries } from "@/lib/backend/collectionStatsReader";

function normalizeHostname(hostname: string) {
  return hostname.replace(/^www\./, "");
}

// Sitemap crawl results live under .tmp (see scripts/crawl-sitemap.mjs) and
// change whenever someone crawls from Brand Management — never cache this
// page on that data.
export const dynamic = "force-dynamic";

const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];
const RANGE_TEXT: Record<DateRange, string> = { "1w": "최근 1주", "2w": "최근 2주", "4w": "최근 4주" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; domain?: string; platform?: string; category?: string; market?: string }>;
}) {
  const orgId = DEFAULT_ORG_ID;
  const params = await searchParams;
  const range: DateRange = VALID_RANGES.includes(params.range as DateRange) ? (params.range as DateRange) : "4w";

  const [org, organizations, statCardsSeed, contentVisibilitySeed, checklist, sentiment, market, traffic, opportunities, brandsData, llmModels] =
    await Promise.all([
      db.organizations.get(orgId),
      db.organizations.list(),
      db.overview.getStatCards(orgId, range),
      db.overview.getContentVisibility(orgId),
      db.overview.getChecklist(orgId),
      db.overview.getSentiment(orgId, range),
      db.overview.getMarketComparison(orgId, range),
      db.overview.getTrafficTrends(orgId, range),
      db.overview.getOpportunities(orgId),
      db.brandsManagement.get(orgId),
      db.seed.llmModels(),
    ]);

  // 카테고리/마켓/도메인 옵션은 Brand Management에 등록된 실제 데이터에서 가져온다
  // (하드코딩된 "전체"뿐이던 플레이스홀더 대체) — 다만 감성/마켓 비교를 뺀 나머지
  // 차트·stat 카드는 아직 org 단위로만 집계되고 있어 이 필터들을 바꿔도 값 자체가
  // 갈리지는 않는다. 실제 필터링은 데이터 파이프라인에 해당 축이 추가돼야 한다.
  // 대기 중(pending) 브랜드는 온보딩(도메인 인증 등)이 끝나지 않아 아직 실제로
  // 추적되지 않는 브랜드라, 활성(active) 브랜드가 되기 전까지는 도메인/마켓
  // 필터에 노출하지 않는다 — 활성으로 전환되면 자동으로 옵션에 포함된다.
  const activeBrands = (brandsData?.brands ?? []).filter((b) => b.status === "active");
  const domainOptions = Array.from(
    new Set(activeBrands.map((b) => normalizeHostname(new URL(b.url).hostname)).concat(org.domain))
  );
  const platformOptions = ["전체", ...llmModels.map((m) => m.name)];
  const categoryOptions = ["전체", ...(brandsData?.categories.map((c) => c.name) ?? [])];
  const marketOptions = ["전체", ...Array.from(new Set(activeBrands.flatMap((b) => b.markets)))];

  const ownBrand = brandsData?.brands.find(
    (b) => normalizeHostname(new URL(b.url).hostname) === normalizeHostname(org.domain)
  );

  // Real crawl data wins when one exists. No crawl yet but a sitemap is
  // registered → prompt to crawl. No sitemap at all → prompt to register
  // one first. See scripts/crawl-sitemap.mjs and the "사이트맵 크롤" button
  // on a brand's detail page.
  const latestCrawl = await getLatestSitemapCrawl(org.domain);
  const contentVisibility =
    latestCrawl && contentVisibilitySeed
      ? buildContentVisibilityFromCrawl(latestCrawl, contentVisibilitySeed)
      : buildEmptyContentVisibility(ownBrand?.sitemapUrl ? "not_crawled" : "no_sitemap", ownBrand?.id ?? null);

  // Real collected-run data (mentions/citations/visibility score, sentiment,
  // market comparison) wins over the seeded weekly snapshots once at least
  // one collection has run — see the "수집 로그" page for the same
  // computation applied live there. Traffic trends and opportunities stay
  // seeded: they need CDN/analytics logs and a live robots.txt/opportunity
  // feed we don't collect yet (neodigm_p0_scope.md §2).
  const [realStats, realSentiment, realMarket] = await Promise.all([
    getRealStatSeries(range),
    getRealSentimentSeries(range),
    getRealMarketComparison(range),
  ]);
  const statCards = statCardsSeed.map((stat) => {
    if (!realStats) return stat;
    if (stat.id === "visibility-score") return { ...stat, ...realStats.visibilityScore };
    if (stat.id === "brand-mentions") return { ...stat, ...realStats.brandMentions };
    if (stat.id === "citations") return { ...stat, ...realStats.citations };
    return stat;
  });
  const sentimentData = realSentiment ?? sentiment;
  const marketData = realMarket ?? market;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">개요</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterDropdown label="" paramKey="org" value={org.name} options={organizations.map((o) => o.name)} bold />
            <RangeDropdown value={range} />
            <FilterDropdown label="" paramKey="domain" value={params.domain ?? org.domain} options={domainOptions} />
            <FilterDropdown label="플랫폼" paramKey="platform" value={params.platform ?? "전체"} options={platformOptions} />
            <FilterDropdown label="카테고리" paramKey="category" value={params.category ?? "전체"} options={categoryOptions} />
            <FilterDropdown label="마켓" paramKey="market" value={params.market ?? "전체"} options={marketOptions} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="detail" icon={<Share2 size={16} />}>
            공유
          </Button>
          <Button variant="detail" icon={<Download size={16} />}>
            PDF로 내보내기
          </Button>
        </div>
      </div>

      {contentVisibility && <ContentVisibilityCard data={contentVisibility} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {checklist.map((item) => (
          <ChecklistCard key={item.id} item={item} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel
          title="감성 분포"
          description={`${RANGE_TEXT[range]}간 AI 답변에 나타난 브랜드 언급의 감성을 우호적·중립·비우호적으로 나눠 보여줘요.`}
          actionLabel="자세히보기"
          actionHref="/brand-presence"
        >
          <SentimentChart data={sentimentData} />
        </ChartPanel>
        <ChartPanel
          title="마켓 비교"
          description={`브랜드를 주요 마켓 브랜드와 비교해요. ${RANGE_TEXT[range]}간 집계된 주간 언급 수와 인용 수예요.`}
          actionLabel="자세히보기"
          actionHref="/brand-presence"
        >
          <MarketComparisonChart data={marketData} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel
          title="트래픽 추이"
          description="에이전틱 트래픽과 리퍼럴 트래픽이 주별로 어떻게 변화했는지 보여줘요."
        >
          <TrafficTrendChart data={traffic} />
        </ChartPanel>
        <ChartPanel
          title="최신 기회"
          description="최근 추가된 기회 3건을 확인하세요."
          actionLabel="전체보기"
          actionHref="/opportunities"
        >
          <div className="flex flex-col gap-2">
            {opportunities.map((opp) => (
              <button
                key={opp.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-left transition-colors hover:bg-neutral-50 cursor-pointer"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <b className="truncate text-sm text-neutral-900">{opp.title}</b>
                  <span className="text-xs text-slate-500">{opp.category}</span>
                </div>
                <ArrowUpRight size={16} className="shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </ChartPanel>
      </div>
    </div>
  );
}
