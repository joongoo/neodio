import { VisibilityOverviewClient } from "@/components/visibility-overview/VisibilityOverviewClient";
import { DateRange, DEFAULT_ORG_ID, db, VisibilityTableRow } from "@/lib/db";

const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];

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

  const topicsByCategory: Record<string, VisibilityTableRow[]> = {};
  await Promise.all(
    topicCategories.map(async (c) => {
      topicsByCategory[c.id] = await db.visibilityOverview.getTopics(orgId, c.id);
    })
  );

  return (
    <VisibilityOverviewClient
      org={org}
      range={range}
      statCards={statCards}
      mentionsByModel={mentionsByModel}
      mentionsByMarket={mentionsByMarket}
      categories={topicCategories}
      topicsByCategory={topicsByCategory}
    />
  );
}
