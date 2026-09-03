import { Dropdown } from "@/components/ui/Dropdown";
import { StatCard } from "@/components/overview/StatCard";
import { RangeDropdown } from "@/components/overview/RangeDropdown";
import { RankedBarList } from "@/components/overview/RankedBarList";
import { TopicsTableSection } from "@/components/visibility-overview/TopicsTableSection";
import { DateRange, DEFAULT_ORG_ID, db } from "@/lib/db";

const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];

const MODEL_TABS = [
  { id: "mentions", label: "언급 수" },
  { id: "visibility", label: "가시성" },
  { id: "exposure", label: "노출" },
];

const MARKET_TABS = [
  { id: "mentions", label: "언급 수" },
  { id: "visibility", label: "가시성" },
  { id: "exposure", label: "노출" },
];

export default async function VisibilityOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const orgId = DEFAULT_ORG_ID;
  const requestedRange = (await searchParams).range;
  const range: DateRange = VALID_RANGES.includes(requestedRange as DateRange)
    ? (requestedRange as DateRange)
    : "4w";

  const [org, statCards, mentionsByModel, mentionsByMarket, topicCategories] = await Promise.all([
    db.organizations.get(orgId),
    db.visibilityOverview.getStatCards(orgId, range),
    db.visibilityOverview.getMentionsByModel(orgId),
    db.visibilityOverview.getMentionsByMarket(orgId),
    db.visibilityOverview.getTopicCategories(orgId),
  ]);

  const topicsByCategory: Record<string, Awaited<ReturnType<typeof db.visibilityOverview.getTopics>>> = {};
  await Promise.all(
    topicCategories.map(async (c) => {
      topicsByCategory[c.id] = await db.visibilityOverview.getTopics(orgId, c.id);
    })
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">가시성 개요</h1>
        <p className="mt-1 text-sm text-neutral-500">선택한 도메인의 AI 가시성 지표와 테이블을 확인하세요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <RangeDropdown value={range} variant="solid" label="기간" />
          <Dropdown variant="solid" label="" value={org.domain} options={[org.domain]} />
          <Dropdown variant="solid" label="마켓" value="전체" />
          <Dropdown variant="solid" label="모델" value="전체" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankedBarList
          panelTitle="Mentions by Model"
          listTitle="모델별 언급 수"
          tabs={MODEL_TABS}
          data={mentionsByModel}
        />
        <RankedBarList
          panelTitle="Mentions by Market"
          listTitle="마켓별 언급 수"
          tabs={MARKET_TABS}
          data={mentionsByMarket}
        />
      </div>

      <TopicsTableSection categories={topicCategories} topicsByCategory={topicsByCategory} />
    </div>
  );
}
