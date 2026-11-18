import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { listRequestLogs, parseRequestLogOptions, type RequestLogDatabase } from "./requestLog";

test("request filters reject invalid inputs and normalize time zones", () => {
  for (const query of ["page=-1", "size=2000", "sort=DROP", "status=bad", "surface=bad", "from=no", "from=2026-11-18T00:00:00"]) {
    assert.throws(() => parseRequestLogOptions(new URLSearchParams(query)), Error, query);
  }
  assert.equal(parseRequestLogOptions(new URLSearchParams({ from: "2026-11-18T09:00:00+09:00" })).from, "2026-11-18T00:00:00.000Z");
});

test("Postgres request list scopes, aggregates before filtering and clamps pages", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL });
  const client = await pool.connect();
  const db: RequestLogDatabase = { query: async <T>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows as T[] };
  try {
    await client.query("BEGIN");
    // Session-local tables shadow real tables. No production rows are changed.
    await client.query(`CREATE TEMP TABLE collection_requests AS SELECT * FROM public.collection_requests WITH NO DATA;
      CREATE TEMP TABLE provider_tasks AS SELECT * FROM public.provider_tasks WITH NO DATA;
      CREATE TEMP TABLE neodio_users AS SELECT * FROM public.neodio_users WITH NO DATA;`);
    await client.query(`INSERT INTO collection_requests(id,organization_id,brand_id,request_kind,status,created_at,approved_at,estimated_cost_usd,cancel_requested)
      VALUES ('a','org','brand','manual','queued','2026-11-18T01:00:00.000Z','2026-11-18T01:00:00.000Z',0.3,false),
      ('b','org','brand','manual','queued','2026-11-18T02:00:00.000Z','2026-11-18T02:00:00.000Z',0.1,false),
      ('hidden','other','brand','manual','queued','2026-11-18T03:00:00.000Z','2026-11-18T03:00:00.000Z',0,false),
      ('other-brand','org','other','manual','queued','2026-11-18T03:00:00.000Z','2026-11-18T03:00:00.000Z',0,false);
      INSERT INTO provider_tasks(id,organization_id,brand_id,collection_request_id,surface,device,status,actual_cost_usd,query_snapshot,completed_at)
      VALUES ('t1','org','brand','a','google-aio','desktop','completed',0.1,'match','2026-11-18T04:00:00.000Z'),
      ('t2','org','brand','a','naver-aio','mobile','completed',0.2,'other','2026-11-18T05:00:00.000Z'),
      ('t3','org','brand','b','google-aio','desktop','submission_unknown',0,'unknown',null);`);
    const list = (query = "") => listRequestLogs("org", "brand", parseRequestLogOptions(new URLSearchParams(query)), db);
    const page = await list("surface=google-aio&status=completed&q=match&page=99");
    assert.equal(page.filteredTotal, 1);
    assert.equal(page.page, 1);
    assert.equal(page.rows[0].counts.total, 2);
    assert.equal(page.rows[0].actualCostUsd, 0.3);
    assert.equal(page.rows[0].completedAt, "2026-11-18T05:00:00.000Z");
    assert.deepEqual((await list()).rows.map(row => row.id), ["b", "a"]);
    assert.equal((await list("status=needs_attention")).rows[0].id, "b");
    assert.equal((await list("q=%27%20OR%201%3D1--")).filteredTotal, 0);
    assert.equal((await list("to=2026-11-18T02%3A00%3A00Z")).filteredTotal, 1);
    assert.equal((await list("q=absent")).pageCount, 1);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
