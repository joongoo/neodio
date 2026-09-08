import { PromptLibraryClient } from "@/components/prompt-library/PromptLibraryClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";

// 가시성 개요의 "추적하기"가 실제로 저장한 토픽(.tmp/tracked-topics)이 새로
// 추가될 수 있으므로 캐시하지 않는다 — collection-runs 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function PromptLibraryPage() {
  const [rows, health, trackedRows] = await Promise.all([
    db.promptLibrary.list(DEFAULT_ORG_ID),
    db.promptLibrary.getHealth(DEFAULT_ORG_ID),
    listTrackedTopics(),
  ]);

  return <PromptLibraryClient initialRows={[...trackedRows, ...rows]} health={health} />;
}
