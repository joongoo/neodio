import { getPromptStore, syncCollectedFiles } from "./database";
import type { CollectedRunFile } from "./collectionRunsTypes";

// 수집 실행은 조직 단위 — 어느 조직의 실행인지는 수집 작업 기록으로 정해진다(database/index.ts syncCollectedFiles).
export async function listCollectedRuns(orgId: string): Promise<CollectedRunFile[]> {
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  return store.runs(orgId);
}

export async function categorizeRun(orgId: string, dir: string, filename: string, category: string, topic: string) {
  const store = await getPromptStore();
  const [run] = await store.query<{ prompt_id: string }>(
    "SELECT prompt_id FROM prompt_runs WHERE organization_id=$1 AND source_dir=$2 AND source_filename=$3", [orgId, dir, filename]);
  if (!run) throw new Error("Unknown collected run");
  const prompt = (await store.getPrompt(orgId, run.prompt_id))!;
  await store.upsertPrompt(orgId, { text: prompt.text, category, topic }, true);
}

export type { CollectedRunFile };
export { isBotBlocked } from "./collectionRunsTypes";
