import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { geminiPeriod, loadGeminiOverview, loadGeminiCitations, loadGeminiCitationDetail, safeCitationUrl } from "./geminiCitations";

test("citation links allow only HTTP and HTTPS", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///secret", "/relative", "invalid"]) assert.equal(safeCitationUrl(value), null);
  assert.equal(safeCitationUrl("https://example.com/source"), "https://example.com/source");
});

test("Gemini results require explicit org and brand ownership, including detail", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE prompt_runs(id text,organization_id text,model_id text,prompt_text_snapshot text,run_at text,status text,original_json jsonb);
      CREATE TEMP TABLE collection_requests(id text,organization_id text,brand_id text);
      CREATE TEMP TABLE legacy_collection_items(run_id text,collection_request_id text,organization_id text,brand_id text);
      INSERT INTO collection_requests VALUES ('request','org','brand'),('foreign','other','brand');
      INSERT INTO prompt_runs SELECT 'run-'||n,'org','model-gemini-25','query '||n,'2026-11-20','success',
        '{"rawMetadata":{"webSearch":false,"citations":[]}}'::jsonb FROM generate_series(1,27) n;
      INSERT INTO legacy_collection_items SELECT 'run-'||n,'request','org','brand' FROM generate_series(1,26) n;
      INSERT INTO legacy_collection_items VALUES ('run-1','request','org','brand'),('run-27','foreign','org','brand');`);
    await client.query(`ALTER TABLE prompt_runs ADD COLUMN prompt_id text;
      UPDATE prompt_runs SET prompt_id=id;
      CREATE TEMP TABLE brand_youtube_channels(brand_id text,channel_id text);
      CREATE TEMP TABLE youtube_videos(video_id text,channel_id text,title text,channel_title text);
      INSERT INTO brand_youtube_channels VALUES ('brand','our-channel');
      INSERT INTO youtube_videos VALUES ('abcdefghijk','our-channel','Our video','Our channel');
      UPDATE prompt_runs SET original_json='{"rawMetadata":{"webSearch":true,"citations":[{"url":"https://youtu.be/abcdefghijk","title":"video"}]}}'::jsonb WHERE id='run-1';`);
    const db = { query: async <T>(sql: string, values: unknown[] = []) => (await client.query(sql, values)).rows as T[] };
    const list = await loadGeminiCitations('org', 'brand', '', 99, db);
    assert.equal(list.total, 26, 'duplicate links do not duplicate runs; conflicting request ownership is excluded');
    assert.equal(list.page, 2);
    assert.equal(list.rows.length, 1);
    assert.equal(list.rows[0].webSearch, true);
    assert.equal((await loadGeminiCitations('org', 'brand', '%', 1, db)).total, 0, 'search treats wildcard characters literally');
    assert.equal((await loadGeminiCitations('org', 'other-brand', '', 1, db)).total, 0);
    assert.equal((await loadGeminiCitations('other', 'brand', '', 1, db)).total, 0);
    assert.ok(await loadGeminiCitationDetail('org', 'brand', 'run-1', db));
    assert.equal(await loadGeminiCitationDetail('org', 'other-brand', 'run-1', db), null);
    assert.equal(await loadGeminiCitationDetail('other', 'brand', 'run-1', db), null);
    assert.equal(await loadGeminiCitationDetail('org', 'brand', 'run-27', db), null);
    const period = geminiPeriod('1w', new Date('2026-11-20T00:00:00Z'));
    const overview = await loadGeminiOverview('org', 'brand', period, db);
    assert.equal(overview.rows.length, 26);
    assert.equal(overview.measured, 1);
    assert.equal(overview.ownVideos, 1);
    assert.equal(overview.ownRate, 1);
    assert.equal((await loadGeminiOverview('org', 'other-brand', period, db)).rows.length, 0);
    assert.equal((await loadGeminiOverview('other', 'brand', period, db)).rows.length, 0);
    assert.equal((await loadGeminiOverview('org', 'brand', geminiPeriod('1w', new Date('2026-12-20')), db)).rows.length, 0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
