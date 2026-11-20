import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { citationPeriod, loadCitationOverview, loadCitationDetail } from "./citationOverview";
import { citationEngine } from "../citationEngines";
import { citationRedirect } from "../citationNavigation";
import { safeCitationUrl } from "../safeCitationUrl";
import { citationPageSize } from "../citationPresentation";

test("engine selection and legacy navigation preserve safe filter state", () => {
  assert.equal(citationEngine("gemini"), "gemini");
  assert.equal(citationEngine("constructor"), "google-aio");
  assert.equal(citationEngine(["gemini"]), "google-aio");
  assert.equal(citationPageSize("25"), 25);
  for (const value of ["-1", "100000", "bad", ["25"], undefined]) assert.equal(citationPageSize(value), 10);
  const target = new URL(citationRedirect("/org/brand", "gemini", { engine: "naver-ai", run: "run-1", range: "1w", q: "a&b", device: "mobile" }), "https://example.com");
  assert.equal(target.searchParams.get("engine"), "gemini");
  assert.equal(target.searchParams.get("q"), "a&b");
  assert.equal(target.searchParams.get("device"), null);
  assert.equal(target.hash, "#citation-answer");
  assert.equal(citationPeriod("1w", new Date("2026-11-19T15:00:00Z")).dates.at(-1), "2026-11-20");
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///secret", "/relative"]) assert.equal(safeCitationUrl(value), null);
  assert.equal(safeCitationUrl("https://example.com"), "https://example.com/");
});

test("all engines use owned records and Google AIO keeps historical dedicated observations without double counting", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL });
  const client = await pool.connect();
  let pending: Promise<unknown> = Promise.resolve();
  const db = { query: <T>(sql: string, values: unknown[] = []): Promise<T[]> => {
    const result = pending.then(async () => (await client.query(sql, values)).rows as T[]);
    pending = result.catch(() => undefined);
    return result;
  } };
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE brands(id text,organization_id text);
      CREATE TEMP TABLE prompts(id text,organization_id text,text text);
      CREATE TEMP TABLE prompt_tracking(id text,organization_id text,brand_id text,prompt_id text,status text);
      CREATE TEMP TABLE prompt_tracking_surfaces(tracking_id text,surface text);
      CREATE TEMP TABLE prompt_runs(id text,organization_id text,prompt_id text,model_id text,platform text,run_at text,status text,raw_response text,observation_outcome text,original_json jsonb,provider_task_id text,job_id text);
      CREATE TEMP TABLE legacy_collection_items(run_id text,collection_request_id text,organization_id text,brand_id text,surface text);
      CREATE TEMP TABLE collection_requests(id text,organization_id text,brand_id text);
      CREATE TEMP TABLE provider_tasks(id text,organization_id text,brand_id text,surface text);
      CREATE TEMP TABLE collection_jobs(id text,organization_id text,data_json jsonb);
      CREATE TEMP TABLE brand_youtube_channels(brand_id text,channel_id text);
      CREATE TEMP TABLE youtube_videos(video_id text,channel_id text,title text,channel_title text);
      CREATE TEMP TABLE aio_keywords(id text,brand_id text,prompt_id text,keyword text,status text);
      CREATE TEMP TABLE aio_observations(id text,brand_id text,keyword_id text,collected_at text,collected_date text,status text,aio_text text);
      CREATE TEMP TABLE aio_citations(observation_id text,position int,url text,title text,domain text,channel_id text);
      INSERT INTO brands VALUES ('brand','org'),('other-brand','org'),('foreign','foreign-org');
      INSERT INTO prompts VALUES ('prompt','org','shared query'),('waiting','org','waiting query');
      INSERT INTO prompt_tracking VALUES ('tracking','org','brand','waiting','active');
      INSERT INTO prompt_tracking_surfaces VALUES ('tracking','gemini');
      INSERT INTO collection_requests VALUES ('request','org','brand'),('other-request','org','other-brand');
      INSERT INTO brand_youtube_channels VALUES ('brand','our-channel');
      INSERT INTO youtube_videos VALUES ('abcdefghijk','our-channel','our video','our channel');
      INSERT INTO provider_tasks VALUES ('task-google','org','brand','google-ai-mode'),('task-naver','org','brand','naver-aio');
      INSERT INTO collection_jobs VALUES ('job','org','{"brandId":"brand"}');
      INSERT INTO prompt_runs VALUES
        ('gemini','org','prompt','model-gemini-25','api','2026-11-20T01:00:00.000Z','success','answer',NULL,'{"rawResponse":"answer","rawMetadata":{"webSearch":true,"citations":[{"url":"https://youtu.be/abcdefghijk","title":"video"}]}}',NULL,NULL),
        ('google','org','prompt','model-google-ai-overview','google-ai-overview','2026-11-20T01:00:00.000Z','success','answer','ai_answered','{"rawResponse":"google","rawMetadata":{}}','task-google',NULL),
        ('naver','org','prompt','model-naver-overview','naver-overview','2026-11-20T01:00:00.000Z','success','','ai_absent','{"rawMetadata":{"observationOutcome":"ai_absent"}}','task-naver',NULL),
        ('naver-ai','org','prompt','model-naver-ai-search','naver-ai-search','2026-11-20T01:00:00.000Z','success','answer',NULL,'{"rawResponse":"naver","rawMetadata":{}}',NULL,'job'),
        ('unlinked','org','prompt','model-gemini-25','api','2026-11-20T05:00:00.000Z','success','secret',NULL,'{"rawMetadata":{"webSearch":true}}',NULL,NULL),
        ('bad-request','org','prompt','model-gemini-25','api','2026-11-20T06:00:00.000Z','success','secret',NULL,'{"rawMetadata":{"webSearch":true}}',NULL,NULL);
      INSERT INTO legacy_collection_items VALUES ('gemini','request','org','brand','gemini'),('gemini','request','org','brand','gemini'),('bad-request','other-request','org','brand','gemini');
      INSERT INTO aio_keywords VALUES ('keyword','brand','prompt','query','active');
      INSERT INTO aio_observations VALUES ('historical','brand','keyword','2026-11-20T01:00:00.000Z','2026-11-20','aio_present','historical answer');
      INSERT INTO aio_citations VALUES ('historical',1,'https://youtu.be/abcdefghijk','video','youtu.be','our-channel');`);
    await client.query("ALTER TABLE prompt_runs ADD COLUMN prompt_text_snapshot text DEFAULT 'shared query'");
    await client.query(`INSERT INTO prompt_runs SELECT 'gemini-failure',organization_id,prompt_id,model_id,platform,'2026-11-20T02:00:00.000Z','failed','',NULL,'{"rawResponse":"","rawMetadata":{}}',NULL,NULL,prompt_text_snapshot FROM prompt_runs WHERE id='gemini';
      INSERT INTO legacy_collection_items VALUES ('gemini-failure','request','org','brand','gemini');`);
    const brand = { id: "brand", url: "https://example.com", urls: [], otherBrands: [] };
    const period = citationPeriod("1w", new Date("2026-11-20T01:00:00Z"));
    const gemini = await loadCitationOverview("org", brand, "gemini", period, db);
    assert.equal(gemini.rows.length, 2, "one actual record plus one tracked, uncollected prompt");
    assert.equal(gemini.measured, 1);
    assert.equal(gemini.ownVideos, 1);
    assert.equal(gemini.ownRate, 1);
    assert.equal(gemini.rows.find(row => row.id === "gemini")?.latestAttemptFailed, true, "a later same-day failure does not erase the latest successful measurement");
    assert.equal(gemini.rows.find(row => row.id)?.id, "gemini", "foreign request and unlinked records are excluded, duplicate links are counted once");
    const google = await loadCitationOverview("org", brand, "google-aio", period, db);
    assert.equal(google.measured, 1);
    assert.equal(google.exposureRate, 1);
    assert.equal(google.rows[0].id, "aio:historical");
    assert.equal((await loadCitationDetail("org", "brand", "google-aio", "aio:historical", db))?.rawResponse, "historical answer");
    assert.equal((await loadCitationOverview("org", brand, "google-ai-mode", period, db)).rows[0].id, "google");
    assert.equal((await loadCitationOverview("org", brand, "naver-aio", period, db)).measured, 0, "absent AI answers do not dilute citation rates");
    assert.equal((await loadCitationOverview("org", brand, "naver-ai", period, db)).rows[0].id, "naver-ai");
    assert.equal(await loadCitationDetail("org", "brand", "google-ai-mode", "gemini", db), null);
    assert.equal(await loadCitationDetail("org", "other-brand", "gemini", "gemini", db), null);
    assert.equal(await loadCitationDetail("foreign-org", "brand", "gemini", "gemini", db), null);
    assert.equal(await loadCitationDetail("org", "other-brand", "google-aio", "aio:historical", db), null);
    for (const engine of ["google-aio", "gemini", "google-ai-mode", "naver-aio", "naver-ai"] as const) {
      assert.equal((await loadCitationOverview("foreign-org", brand, engine, period, db)).rows.length, 0);
      assert.equal((await loadCitationOverview("org", { ...brand, id: "other-brand" }, engine, period, db)).rows.length, 0);
    }
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});
