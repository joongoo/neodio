import { PromptLibraryClient } from "@/components/prompt-library/PromptLibraryClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listTrackedTopics, listSeedLibraryRows } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getTopicOptionsByCategory } from "@/lib/backend/promptTopics";

// 가시성 개요의 "추적하기"가 실제로 저장한 토픽(.tmp/tracked-topics)이 새로
// 추가될 수 있으므로 캐시하지 않는다 — collection-runs 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function PromptLibraryPage() {
  const [rows, health, trackedRows, deletedIds, topicOptions] = await Promise.all([
    listSeedLibraryRows(DEFAULT_ORG_ID),
    db.promptLibrary.getHealth(DEFAULT_ORG_ID),
    listTrackedTopics(DEFAULT_ORG_ID),
    getDeletedLibraryRowIds(DEFAULT_ORG_ID),
    getTopicOptionsByCategory(DEFAULT_ORG_ID),
  ]);

  // mock 시드 행은 코드에 박혀있어 파일을 지울 수 없다 — 삭제된 id 목록으로
  // 걸러내야 "삭제해도 새로고침하면 부활"하는 문제가 안 생긴다.
  const visibleRows = rows.filter((r) => !deletedIds.has(r.id));

  return (
    <PromptLibraryClient
      initialRows={[...trackedRows, ...visibleRows]}
      health={health}
      topicOptionsByCategory={topicOptions.byCategory}
      uncategorizedTopicOptions={topicOptions.uncategorized}
    />
  );
}
