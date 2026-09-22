import { getPromptStore, syncCollectedFiles } from "../src/lib/backend/database";
import { seedBrands } from "../src/lib/db/data/seed";

async function main() {
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  for (const { promptRun } of await store.runs("neodigm")) if (promptRun.status === "success") await store.analyze(promptRun, seedBrands);
  const tables = ["categories", "topics", "prompts", "prompt_sources", "prompt_tracking", "prompt_runs", "run_analyses", "brand_observations", "citations"];
  const counts = await Promise.all(tables.map(async table => [table, (await store.query<{ count: number }>(`SELECT count(*) AS count FROM ${table}`))[0].count]));
  console.table(Object.fromEntries(counts));
  // Postgres enforces every FOREIGN KEY constraint on write, unlike SQLite's
  // opt-in PRAGMA foreign_key_check — nothing left to check post-hoc here.
  console.log("Legacy files preserved.");
  await store.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
