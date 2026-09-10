import { notFound } from "next/navigation";
import { TopicOpportunityDetailClient } from "@/components/opportunities/TopicOpportunityDetailClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealTopicRows } from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getTopicOpportunityTargets } from "@/lib/backend/topicOpportunityTargets";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getLlmBridgeEntry } from "@/lib/backend/llmBridgeStore";

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function TopicOpportunityDetailPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: encodedTopic } = await params;
  const topic = decodeURIComponent(encodedTopic);

  const demo = await isDemoMode();
  if (demo) notFound();

  const [promptLibraryRowsRaw, trackedRows, deletedIds, targetUrls] = await Promise.all([
    db.promptLibrary.list(DEFAULT_ORG_ID),
    listTrackedTopics(),
    getDeletedLibraryRowIds(),
    getTopicOpportunityTargets(),
  ]);
  const libraryPrompts = [...promptLibraryRowsRaw.filter((r) => !deletedIds.has(r.id)), ...trackedRows].map((r) => r.prompt);

  const realTopicRows = await getRealTopicRows({}, { libraryPrompts, targetUrls }).catch(() => null);
  const row = [...(realTopicRows?.opportunities ?? []), ...(realTopicRows?.topPrompts ?? [])].find((r) => r.topic === topic);
  if (!row) notFound();

  const guideEntry = await getLlmBridgeEntry<{ guide: string }>("topic-guide", topic);
  const rowWithGuide = { ...row, guide: guideEntry?.guide };

  return <TopicOpportunityDetailClient row={rowWithGuide} />;
}
