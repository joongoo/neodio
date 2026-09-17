import { getPromptStore, syncCollectedFiles } from "../src/lib/backend/database";
import { seedBrands } from "../src/lib/db/data/seed";

async function main() {
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  for (const { promptRun } of store.runs("neodigm")) if (promptRun.status === "success") store.analyze(promptRun, seedBrands);
  const tables = ["categories", "topics", "prompts", "prompt_sources", "prompt_tracking", "prompt_runs", "run_analyses", "brand_observations", "citations"];
  console.table(Object.fromEntries(tables.map(table => [table, store.sql.prepare(`SELECT count(*) AS count FROM ${table}`).get()!.count])));
  const errors = store.sql.prepare("PRAGMA foreign_key_check").all();
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log("Foreign keys valid. Legacy files preserved.");
  store.sql.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
