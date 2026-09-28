import { notFound } from "next/navigation";
import { TopicOpportunityDetailClient } from "@/components/opportunities/TopicOpportunityDetailClient";

import { getRealTopicRows } from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getTopicOpportunityTargets } from "@/lib/backend/topicOpportunityTargets";
import { listTrackedTopics, listSeedLibraryRows } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getLlmBridgeEntry } from "@/lib/backend/llmBridgeStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function TopicOpportunityDetailPage({ params }: { params: Promise<{ topic: string }> }) {
  const tenant = await getCurrentTenant();
  const { topic: encodedTopic } = await params;
  const topic = decodeURIComponent(encodedTopic);

  const demo = await isDemoMode();
  if (demo) notFound();

  const [promptLibraryRowsRaw, trackedRows, deletedIds, targetUrls] = await Promise.all([
    listSeedLibraryRows(tenant.orgId, tenant.brandId),
    listTrackedTopics(tenant.orgId, tenant.brandId),
    getDeletedLibraryRowIds(tenant.orgId),
    getTopicOpportunityTargets(tenant.orgId),
  ]);
  const libraryPrompts = [...promptLibraryRowsRaw.filter((r) => !deletedIds.has(r.id)), ...trackedRows].map((r) => r.prompt);

  const realTopicRows = await getRealTopicRows({}, { libraryPrompts, targetUrls }).catch(() => null);
  const row = [...(realTopicRows?.opportunities ?? []), ...(realTopicRows?.topPrompts ?? [])].find((r) => r.topic === topic);
  if (!row) notFound();

  const guideEntry = await getLlmBridgeEntry<{ guide: string }>(tenant.orgId, "topic-guide", topic);
  const rowWithGuide = { ...row, guide: guideEntry?.guide };

  return <TopicOpportunityDetailClient row={rowWithGuide} />;
}
