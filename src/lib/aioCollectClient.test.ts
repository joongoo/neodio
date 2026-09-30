import assert from "node:assert/strict";
import test from "node:test";
import { cancelAioCollect, pollAioCollect, resumeAioCollect, startAioCollect } from "./aioCollectClient";
import type { CollectorSetupDetail } from "./collectorSetup";

// 화면 쪽 AIO 수집 창구 — 서버(fetch)와 수집기(127.0.0.1) 응답을 흉내 내 분기를 확인한다.
const realFetch = globalThis.fetch;
const events: CollectorSetupDetail[] = [];
Object.assign(globalThis, { window: { dispatchEvent: (event: Event) => events.push((event as CustomEvent<CollectorSetupDetail>).detail) } });
test.beforeEach(() => {
  events.length = 0;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function mockFetch(routes: [string, Handler][], calls: { url: string; init?: RequestInit }[] = []) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find(([key]) => url.includes(key));
    if (!route) throw new Error(`unmocked ${url}`);
    return route[1](url, init);
  }) as typeof fetch;
  return calls;
}
const status = (over: Record<string, unknown> = {}) => json({ app: "neodio-collector", version: "0.3.0", platform: "mac-arm64", chrome: true, runningJobId: null, ...over });

const plan = {
  brandId: "brand-a", label: "전체 키워드", country: "kr", language: "ko", minDelayMs: 60000, maxDelayMs: 120000,
  tasks: [
    { keywordId: "kw-1", keyword: "마케팅 자동화", device: "mobile" },
    { keywordId: "kw-2", keyword: "CRM 추천", device: "desktop" },
  ],
};
const item = (statusValue: string, over: Record<string, unknown> = {}) => ({ keyword: "k", status: statusValue, engine: null, results: statusValue === "done" ? 1 : 0, error: null, ...over });
function agentJob(over: Record<string, unknown> = {}, items = [item("done"), item("done")]) {
  return { id: "cjob-1", kind: "aio-collect", aio: { ...plan }, aioState: { waitUntil: null, captcha: false }, label: "전체 키워드", engines: [], status: "done", items, createdAt: "2026-09-30T01:00:00.000Z", finishedAt: "2026-09-30T01:05:00.000Z", appliedAt: null, log: [], ...over };
}
const raw = (extra: Record<string, unknown> = {}) => ({ status: "aio_present", collectedAt: "2026-09-30T01:01:00.000Z", sources: [], paragraphs: [], ...extra });
const imported = { saved: true, status: "aio_present", captcha: false, sources: 5, youtube: 2, ownPositions: [3], message: null };

test("local mode: the server's job is returned as is", async () => {
  mockFetch([["/api/youtube-aio/collect", () => json({ job: { id: "aiojob-1", status: "running", results: [] } })]]);
  const result = await startAioCollect({ brandId: "brand-a", force: false });
  assert.ok(result.ok);
  assert.equal(result.job.id, "aiojob-1");
});

test("a plain server error (e.g. no channel connected) is shown to the user, not turned into a setup dialog", async () => {
  mockFetch([["/api/youtube-aio/collect", () => json({ error: "YouTube 채널을 먼저 연동하세요." }, 400)]]);
  assert.deepEqual(await startAioCollect({ brandId: "brand-a", force: false }), { ok: false, error: "YouTube 채널을 먼저 연동하세요.", handled: false, jobId: undefined });
  assert.equal(events.length, 0);
});

test("agent mode: missing, outdated (0.2.x cannot collect AIO) and Chrome-less collectors open the setup dialog", async () => {
  const start = () => startAioCollect({ brandId: "brand-a", force: false });
  mockFetch([["/api/youtube-aio/collect", () => json({ agent: plan })], ["127.0.0.1", () => { throw new Error("refused"); }]]);
  assert.deepEqual(await start(), { ok: false, error: "", handled: true });
  assert.equal(events.at(-1)?.reason, "unreachable");

  mockFetch([["/api/youtube-aio/collect", () => json({ agent: plan })], ["127.0.0.1", () => status({ version: "0.2.0" })]]);
  await start();
  assert.equal(events.at(-1)?.reason, "outdated");

  mockFetch([["/api/youtube-aio/collect", () => json({ agent: plan })], ["127.0.0.1", () => status({ chrome: false })]]);
  await start();
  assert.equal(events.at(-1)?.reason, "no_chrome");
});

test("agent mode: a ready collector gets the server's plan and the job id is namespaced", async () => {
  const calls = mockFetch([
    ["/api/youtube-aio/collect", () => json({ agent: plan })],
    ["/status", () => status()],
    ["/jobs", () => json({ job: agentJob({ status: "queued", finishedAt: null }, [item("pending"), item("pending")]) })],
  ]);
  const result = await startAioCollect({ brandId: "brand-a", force: false });
  assert.ok(result.ok);
  assert.equal(result.job.id, "agent:cjob-1");
  assert.equal(result.job.total, 2);
  assert.equal(result.job.status, "running");
  const create = calls.find((c) => c.url.endsWith("/jobs"))!;
  const body = JSON.parse(String(create.init?.body));
  assert.equal(body.kind, "aio-collect");
  assert.equal(body.label, "전체 키워드");
  assert.deepEqual(body.aio.tasks, plan.tasks);
  assert.equal("label" in body.aio, false);
});

test("polling a running job shows the current search or the wait until the next one", async () => {
  mockFetch([["/jobs/cjob-1/aio", () => json({ results: [{ index: 0, result: raw() }] })], ["/jobs/cjob-1", () => json({ job: agentJob({ status: "running", finishedAt: null }, [item("done"), item("running")]) })], ["/api/youtube-aio/import", () => json(imported)]]);
  const searching = await pollAioCollect("agent:cjob-1");
  assert.equal(searching?.status, "running");
  assert.deepEqual(searching?.current, { keyword: "CRM 추천", device: "desktop" });
  assert.equal(searching?.results.length, 1);

  mockFetch([["/jobs/cjob-1/aio", () => json({ results: [{ index: 0, result: raw() }] })], ["/jobs/cjob-1", () => json({ job: agentJob({ status: "running", finishedAt: null, aioState: { waitUntil: 1790000000000, captcha: false } }, [item("done"), item("pending")]) })], ["/api/youtube-aio/import", () => json(imported)]]);
  const waiting = await pollAioCollect("agent:cjob-1");
  assert.equal(waiting?.current, null);
  assert.equal(waiting?.waitUntil, 1790000000000);
});

test("each finished search is uploaded exactly once, even when polled concurrently, and the job ends only after the uploads", async () => {
  let uploads = 0;
  const calls = mockFetch([
    ["/jobs/cjob-up/aio", () => json({ results: [{ index: 0, result: raw() }, { index: 1, result: raw() }] })],
    ["/jobs/cjob-up/applied", () => json({ ok: true })],
    ["/jobs/cjob-up", () => json({ job: agentJob({ id: "cjob-up" }) })],
    ["/api/youtube-aio/import", async () => {
      uploads++;
      return json(imported);
    }],
  ]);
  const [a, b] = await Promise.all([pollAioCollect("agent:cjob-up"), pollAioCollect("agent:cjob-up")]);
  assert.equal(uploads, 2);
  assert.equal(a?.status, "done");
  assert.equal(b?.results.length, 2);
  assert.deepEqual(a?.results[0], { keyword: "마케팅 자동화", device: "mobile", status: "aio_present", captcha: false, sources: 5, youtube: 2, ownPositions: [3], message: null });
  assert.ok(calls.some((c) => c.url.endsWith("/applied")), "the collector is told the job was applied");
  const body = JSON.parse(String(calls.find((c) => c.url.includes("/api/youtube-aio/import"))!.init?.body));
  assert.deepEqual(Object.keys(body).sort(), ["brandId", "device", "keywordId", "result"]);
});

test("the job stays running until every finished search could be fetched", async () => {
  mockFetch([["/jobs/cjob-2/aio", () => { throw new Error("connection reset"); }], ["/jobs/cjob-2", () => json({ job: agentJob({ id: "cjob-2" }) })]]);
  assert.equal((await pollAioCollect("agent:cjob-2"))?.status, "running");
});

test("captcha, cancel and all-failed jobs end with the matching status", async () => {
  mockFetch([["/jobs/cjob-3/aio", () => json({ results: [{ index: 0, result: raw({ status: "failed", errorKind: "captcha" }) }] })], ["/jobs/cjob-3/applied", () => json({})], ["/jobs/cjob-3", () => json({ job: agentJob({ id: "cjob-3", aioState: { waitUntil: null, captcha: true } }, [item("done"), item("cancelled")]) })], ["/api/youtube-aio/import", () => json({ ...imported, status: "failed", captcha: true, sources: 0, youtube: 0, ownPositions: [] })]]);
  const captcha = await pollAioCollect("agent:cjob-3");
  assert.equal(captcha?.status, "captcha");
  assert.equal(captcha?.results[0].captcha, true);

  mockFetch([["/jobs/cjob-4", () => json({ job: agentJob({ id: "cjob-4", status: "cancelled" }, [item("cancelled"), item("cancelled")]) })], ["/jobs/cjob-4/applied", () => json({})]]);
  assert.equal((await pollAioCollect("agent:cjob-4"))?.status, "cancelled");

  mockFetch([["/jobs/cjob-5", () => json({ job: agentJob({ id: "cjob-5" }, [item("error", { error: "검색에 실패했습니다." }), item("error", { error: "검색에 실패했습니다." })]) })], ["/jobs/cjob-5/applied", () => json({})]]);
  const failed = await pollAioCollect("agent:cjob-5");
  assert.equal(failed?.status, "error");
  assert.equal(failed?.error, "검색에 실패했습니다.");
});

test("a failed upload becomes a failed row instead of breaking the job", async () => {
  mockFetch([["/jobs/cjob-6/aio", () => json({ results: [{ index: 0, result: raw() }, { index: 1, result: raw() }] })], ["/jobs/cjob-6/applied", () => json({})], ["/jobs/cjob-6", () => json({ job: agentJob({ id: "cjob-6" }) })], ["/api/youtube-aio/import", () => json({ error: "수집 결과 형식이 올바르지 않습니다." }, 400)]]);
  const job = await pollAioCollect("agent:cjob-6");
  assert.equal(job?.status, "done");
  assert.deepEqual(job?.results.map((r) => [r.status, r.message]), [["failed", "수집 결과 형식이 올바르지 않습니다."], ["failed", "수집 결과 형식이 올바르지 않습니다."]]);
});

test("cancel goes to the collector for agent jobs and to the server otherwise", async () => {
  const calls = mockFetch([["127.0.0.1", () => json({ job: {} })], ["/api/youtube-aio/collect", () => json({ ok: true })]]);
  await cancelAioCollect("agent:cjob-1");
  assert.ok(calls[0].url.includes("/jobs/cjob-1/cancel"));
  await cancelAioCollect("aiojob-9");
  assert.ok(calls[1].url.includes("/api/youtube-aio/collect?jobId=aiojob-9"));
  assert.equal(calls[1].init?.method, "DELETE");
});

test("resume picks up this brand's unapplied job from the collector, ignoring others and old collectors", async () => {
  const other = agentJob({ id: "cjob-other", aio: { ...plan, brandId: "brand-z" } });
  mockFetch([
    ["/api/youtube-aio/collect?brandId", () => json({ job: null })],
    ["/status", () => status()],
    ["/jobs/cjob-r/aio", () => json({ results: [{ index: 0, result: raw() }, { index: 1, result: raw() }] })],
    ["/jobs/cjob-r/applied", () => json({})],
    ["/jobs/cjob-r", () => json({ job: agentJob({ id: "cjob-r" }) })],
    ["/jobs", () => json({ jobs: [other, agentJob({ id: "cjob-old", createdAt: "2026-09-29T00:00:00.000Z" }), agentJob({ id: "cjob-r" }), agentJob({ id: "cjob-done", appliedAt: "2026-09-30T02:00:00.000Z" })] })],
    ["/api/youtube-aio/import", () => json(imported)],
  ]);
  const job = await resumeAioCollect("brand-a");
  assert.equal(job?.id, "agent:cjob-r");
  assert.equal(job?.results.length, 2);

  mockFetch([["/api/youtube-aio/collect?brandId", () => json({ job: null })], ["/status", () => status({ version: "0.2.0" })]]);
  assert.equal(await resumeAioCollect("brand-a"), null);
});
