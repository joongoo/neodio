import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";

// 수집 파일(.tmp/*-ai/*.json)이 그 파일을 만든 수집 작업의 조직으로 들어가는지 —
// 실제 Postgres, 이 파일 전용 스키마, 임시 작업 디렉터리(수집 파일 위치가
// process.cwd() 기준이라 테스트 동안만 옮긴다).
const baseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!baseUrl) throw new Error("POSTGRES_URL is required to run org sync tests — see docs/database.md");
const schema = `test_orgsync_${randomUUID().replaceAll("-", "_")}`;
const scopedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
process.env.POSTGRES_URL = scopedUrl;
process.env.POSTGRES_URL_NON_POOLING = scopedUrl;

const originalCwd = process.cwd();
const workDir = mkdtempSync(path.join(os.tmpdir(), "neodio-orgsync-"));
let db: typeof import("./index");

function writeRun(filename: string, runId: string, query: string, collectionJobId?: string) {
  const dir = path.join(workDir, ".tmp", "naver-ai");
  mkdirSync(dir, { recursive: true });
  const promptRun = {
    id: runId,
    promptId: "manual",
    llmModelId: "model-naver-ai",
    marketId: "market-kr",
    runAt: "2026-09-28T00:00:00.000Z",
    status: "success",
    rawResponse: "answer",
    rawMetadata: { source: "naver-ai", query, collectionJobId },
  };
  writeFileSync(path.join(dir, filename), JSON.stringify({ promptRun }));
}

before(async () => {
  const setup = new Pool({ connectionString: baseUrl });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.end();
  process.chdir(workDir);
  db = await import("./index");
});

after(async () => {
  process.chdir(originalCwd);
  await (await db.getPromptStore()).close();
  rmSync(workDir, { recursive: true, force: true });
  const cleanup = new Pool({ connectionString: baseUrl });
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.end();
});

test("collected runs land in the organization of the job that produced them", async () => {
  const store = await db.getPromptStore();
  const sf = await store.createOrganization("Salesforce", "salesforce");
  await db.persistCollectionJob({
    id: "job-sf",
    organizationId: sf.id,
    keyword: "CRM 추천",
    engines: ["naver"],
    stage: "done",
    log: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: Date.now(),
  });
  writeRun("sf.json", "run-sf", "CRM 추천", "job-sf");
  writeRun("legacy.json", "run-legacy", "네오다임 후기");

  await db.syncCollectedFiles(store);

  assert.deepEqual((await store.runs(sf.id)).map((r) => r.promptRun.id), ["run-sf"]);
  assert.deepEqual((await store.runs("neodigm")).map((r) => r.promptRun.id), ["run-legacy"], "files without a job go to the default organization");
  const [prompt] = await store.query<{ organization_id: string }>("SELECT organization_id FROM prompts WHERE text='CRM 추천'");
  assert.equal(prompt.organization_id, sf.id, "the run's prompt is created in the same organization");
  assert.equal((await db.getPersistedCollectionJob("job-sf"))?.organizationId, sf.id);
});
