import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";

// 선택 수집의 "반영" — 사용자 PC 수집기가 모은 결과를 브라우저가 올리면 지금 조직으로
// 저장한다. 실제 Postgres, 이 파일 전용 스키마.
const baseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!baseUrl) throw new Error("POSTGRES_URL is required to run collection import tests — see docs/database.md");
const schema = `test_import_${randomUUID().replaceAll("-", "_")}`;
const scopedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
process.env.POSTGRES_URL = scopedUrl;
process.env.POSTGRES_URL_NON_POOLING = scopedUrl;

let db: typeof import("./database");
let importRoute: typeof import("../../app/api/collection-runs/import/route");

const run = (id: string, query: string, source = "naver-ai", status = "success") => ({
  filename: `${source}-${id}.json`,
  promptRun: {
    id,
    promptId: "manual",
    llmModelId: "model-naver-ai",
    marketId: "market-kr",
    runAt: "2026-09-29T00:00:00.000Z",
    status,
    rawResponse: status === "success" ? "answer" : "",
    rawMetadata: { source, query, collectionJobId: "cjob-local-1", citations: [] },
  },
});

const post = (body: unknown) =>
  importRoute.POST(new NextRequest("http://localhost/api/collection-runs/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

before(async () => {
  const setup = new Pool({ connectionString: baseUrl });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.end();
  db = await import("./database");
  importRoute = await import("../../app/api/collection-runs/import/route");
});

after(async () => {
  await (await db.getPromptStore()).close();
  const cleanup = new Pool({ connectionString: baseUrl });
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.end();
});

test("collector results are imported into the current organization, idempotently", async () => {
  const store = await db.getPromptStore();
  const before = (await store.runs("neodigm")).length;
  const res = await post({ runs: [run("run-a", "CRM 추천"), run("run-b", "CRM 추천", "google-ai", "failed")] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { imported: 2 });

  const again = await post({ runs: [run("run-a", "CRM 추천")] });
  assert.equal(again.status, 200);
  const runs = (await store.runs("neodigm")).filter((r) => r.promptRun.id === "run-a" || r.promptRun.id === "run-b");
  assert.equal((await store.runs("neodigm")).length, before + 2, "re-applying the same run does not duplicate it");
  assert.deepEqual(runs.map((r) => [r.promptRun.id, r.dir, r.promptRun.status]).sort(), [
    ["run-a", ".tmp/naver-ai", "success"],
    ["run-b", ".tmp/google-ai", "failed"],
  ]);
});

test("malformed or foreign results are rejected without partial writes", async () => {
  const store = await db.getPromptStore();
  assert.equal((await post({ runs: [] })).status, 400);
  assert.equal((await post({ runs: [{ filename: "../x.json", promptRun: run("run-x", "q").promptRun }] })).status, 400);
  assert.equal((await post({ runs: [run("run-y", "q", "chatgpt")] })).status, 400, "unknown source");

  // 이미 다른 조직에 있는 실행 → 409, 같이 보낸 새 실행도 저장되지 않는다(한 트랜잭션).
  const other = await store.createOrganization("Salesforce", "salesforce");
  await store.importRun(other.id, { dir: ".tmp/naver-ai", filename: "sf.json", promptRun: run("run-sf", "세일즈포스").promptRun as never }, null);
  const res = await post({ runs: [run("run-new", "새 질문"), run("run-sf", "세일즈포스")] });
  assert.equal(res.status, 409);
  const [row] = await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompt_runs WHERE id='run-new'");
  assert.equal(row.n, 0);
});
