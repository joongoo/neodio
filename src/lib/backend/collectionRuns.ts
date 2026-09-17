import { getPromptStore, syncCollectedFiles } from "./database";
import type { CollectedRunFile } from "./collectionRunsTypes";

export async function listCollectedRuns(): Promise<CollectedRunFile[]> {
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  return store.runs("neodigm");
}

export async function categorizeRun(dir: string, filename: string, category: string, topic: string) {
  const store = await getPromptStore();
  const run = store.sql.prepare("SELECT prompt_id FROM prompt_runs WHERE organization_id=? AND source_dir=? AND source_filename=?").get("neodigm", dir, filename);
  if (!run) throw new Error("Unknown collected run");
  const prompt = store.getPrompt("neodigm", run.prompt_id as string)!;
  store.upsertPrompt("neodigm", { text: prompt.text, category, topic }, true);
}

export type { CollectedRunFile };
export { isBotBlocked } from "./collectionRunsTypes";
