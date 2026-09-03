import { ArrowUpRight, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { SentimentChart } from "@/components/charts/SentimentChart";
import { MarketComparisonChart } from "@/components/charts/MarketComparisonChart";
import { TrafficTrendChart } from "@/components/charts/TrafficTrendChart";
import { RangeDropdown } from "@/components/overview/RangeDropdown";
import { ChecklistCard } from "@/components/overview/ChecklistCard";
import { ChartPanel } from "@/components/overview/ChartPanel";
import { ContentVisibilityCard } from "@/components/overview/ContentVisibilityCard";
import { StatCard } from "@/components/overview/StatCard";
import { DateRange, DEFAULT_ORG_ID, db } from "@/lib/db";

const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];
const RANGE_TEXT: Record<DateRange, string> = { "1w": "최근 1주", "2w": "최근 2주", "4w": "최근 4주" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const orgId = DEFAULT_ORG_ID;
  const requestedRange = (await searchParams).range;
  const range: DateRange = VALID_RANGES.includes(requestedRange as DateRange)
    ? (requestedRange as DateRange)
    : "4w";

  const [org, statCards, contentVisibility, checklist, sentiment, market, traffic, opportunities] =
    await Promise.all([
      db.organizations.get(orgId),
      db.overview.getStatCards(orgId, range),
      db.overview.getContentVisibility(orgId),
      db.overview.getChecklist(orgId),
      db.overview.getSentiment(orgId, range),
      db.overview.getMarketComparison(orgId, range),
      db.overview.getTrafficTrends(orgId, range),
      db.overview.getOpportunities(orgId),
    ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">개요</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Dropdown label="" value={org.name} bold options={[org.name]} />
            <RangeDropdown value={range} />
            <Dropdown label="" value={org.domain} options={[org.domain]} />
            <Dropdown label="플랫폼" value="전체" />
            <Dropdown label="카테고리" value="전체" />
            <Dropdown label="마켓" value="전체" />
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
        >
          <SentimentChart data={sentiment} />
        </ChartPanel>
        <ChartPanel
          title="마켓 비교"
          description={`브랜드를 주요 마켓 브랜드와 비교해요. ${RANGE_TEXT[range]}간 집계된 주간 언급 수와 인용 수예요.`}
          actionLabel="자세히보기"
        >
          <MarketComparisonChart data={market} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel
          title="트래픽 추이"
          description="에이전틱 트래픽과 리퍼럴 트래픽이 주별로 어떻게 변화했는지 보여줘요."
          actionLabel="자세히보기"
        >
          <TrafficTrendChart data={traffic} />
        </ChartPanel>
        <ChartPanel
          title="최신 기회"
          description="최근 추가된 기회 3건을 확인하세요."
          actionLabel="전체보기"
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
