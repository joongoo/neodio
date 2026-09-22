import { getPromptStore, syncCollectedFiles } from "./database";
import type { CollectedRunFile } from "./collectionRunsTypes";

export async function listCollectedRuns(): Promise<CollectedRunFile[]> {
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  return store.runs("neodigm");
}

export async function categorizeRun(dir: string, filename: string, category: string, topic: string) {
  const store = await getPromptStore();
  const [run] = await store.query<{ prompt_id: string }>(
    "SELECT prompt_id FROM prompt_runs WHERE organization_id=$1 AND source_dir=$2 AND source_filename=$3", ["neodigm", dir, filename]);
  if (!run) throw new Error("Unknown collected run");
  const prompt = (await store.getPrompt("neodigm", run.prompt_id))!;
  await store.upsertPrompt("neodigm", { text: prompt.text, category, topic }, true);
}

export type { CollectedRunFile };
export { isBotBlocked } from "./collectionRunsTypes";
