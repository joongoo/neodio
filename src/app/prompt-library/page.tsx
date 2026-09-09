import { PromptLibraryClient } from "@/components/prompt-library/PromptLibraryClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";

// 가시성 개요의 "추적하기"가 실제로 저장한 토픽(.tmp/tracked-topics)이 새로
// 추가될 수 있으므로 캐시하지 않는다 — collection-runs 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function PromptLibraryPage() {
  const [rows, health, trackedRows, deletedIds] = await Promise.all([
    db.promptLibrary.list(DEFAULT_ORG_ID),
    db.promptLibrary.getHealth(DEFAULT_ORG_ID),
    listTrackedTopics(),
    getDeletedLibraryRowIds(),
  ]);

  // mock 시드 행은 코드에 박혀있어 파일을 지울 수 없다 — 삭제된 id 목록으로
  // 걸러내야 "삭제해도 새로고침하면 부활"하는 문제가 안 생긴다.
  const visibleRows = rows.filter((r) => !deletedIds.has(r.id));

  return <PromptLibraryClient initialRows={[...trackedRows, ...visibleRows]} health={health} />;
}
