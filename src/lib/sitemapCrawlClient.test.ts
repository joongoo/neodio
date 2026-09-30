import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTOR_SETUP_EVENT, getSitemapCrawlStatus, startSitemapCrawl, type CollectorSetupDetail } from "./sitemapCrawlClient";

// 화면 쪽 크롤 창구 — 서버(fetch)와 수집기(127.0.0.1) 응답을 흉내 내 분기를 확인한다.
const realFetch = globalThis.fetch;
const events: CollectorSetupDetail[] = [];
Object.assign(globalThis, {
  window: { dispatchEvent: (event: Event) => events.push((event as CustomEvent<CollectorSetupDetail>).detail) },
});
test.beforeEach(() => {
  events.length = 0;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function mockFetch(routes: Record<string, Handler>, calls: { url: string; init?: RequestInit }[] = []) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unmocked ${url}`);
    return routes[key](url, init);
  }) as typeof fetch;
  return calls;
}
const agentStatus = (over: Record<string, unknown> = {}) => json({ app: "neodio-collector", version: "0.2.0", platform: "mac-arm64", chrome: true, runningJobId: null, ...over });
const agentMode = () => json({ error: "agent", code: "agent" }, 501);

test("local mode: the server starts the crawl itself", async () => {
  mockFetch({ "/api/sitemap-crawl/start": () => json({ jobId: "sitemap-job-1" }) });
  assert.deepEqual(await startSitemapCrawl({ domain: "neodigm.com", sitemapUrl: "https://neodigm.com/sitemap.xml" }), { ok: true, jobId: "sitemap-job-1" });
});

test("a plain server error is reported to the caller, not turned into a setup dialog", async () => {
  mockFetch({ "/api/sitemap-crawl/start": () => json({ error: "사이트맵 URL이 필요합니다" }, 400) });
  assert.deepEqual(await startSitemapCrawl({ domain: "x.com" }), { ok: false, error: "사이트맵 URL이 필요합니다", handled: false });
  assert.equal(events.length, 0);
});

test("agent mode: missing, outdated and Chrome-less collectors open the setup dialog instead of starting", async () => {
  mockFetch({ "/api/sitemap-crawl/start": agentMode, "127.0.0.1": () => { throw new Error("connection refused"); } });
  assert.deepEqual(await startSitemapCrawl({ domain: "neodigm.com", sitemapUrl: "https://neodigm.com/s.xml" }), { ok: false, error: "", handled: true });
  assert.equal(events.at(-1)?.reason, "unreachable");

  mockFetch({ "/api/sitemap-crawl/start": agentMode, "127.0.0.1": () => agentStatus({ version: "0.1.0" }) });
  await startSitemapCrawl({ domain: "neodigm.com", sitemapUrl: "https://neodigm.com/s.xml" });
  assert.equal(events.at(-1)?.reason, "outdated");

  mockFetch({ "/api/sitemap-crawl/start": agentMode, "127.0.0.1": () => agentStatus({ chrome: false }) });
  await startSitemapCrawl({ domain: "neodigm.com", sitemapUrl: "https://neodigm.com/s.xml" });
  assert.equal(events.at(-1)?.reason, "no_chrome");
});

test("agent mode: a ready collector gets a crawl job and the job id is namespaced", async () => {
  const calls = mockFetch({
    "/api/sitemap-crawl/start": agentMode,
    "/status": () => agentStatus(),
    "/jobs": () => json({ job: { id: "cjob-9", items: [], log: [], status: "queued" } }),
  });
  const result = await startSitemapCrawl({ domain: "neodigm.com", urls: ["https://neodigm.com/a"], sitemapUrl: "https://neodigm.com/s.xml" });
  assert.deepEqual(result, { ok: true, jobId: "agent:cjob-9" });
  const create = calls.find((c) => c.url.endsWith("/jobs"))!;
  const body = JSON.parse(String(create.init?.body));
  assert.equal(body.kind, "sitemap-crawl");
  assert.deepEqual(body.crawl, { domain: "neodigm.com", sitemapUrl: null, urls: ["https://neodigm.com/a"] }, "a re-crawl of specific URLs drops the sitemap");
});

const crawlResult = {
  domain: "neodigm.com", sitemapUrl: "https://neodigm.com/s.xml", crawledAt: "2026-09-30T01:00:00.000Z",
  urls: [
    { url: "https://neodigm.com/a", status: "success", rawTextLength: 10, renderedTextLength: 20, contentVisibility: 50, error: null },
    { url: "https://neodigm.com/b", status: "success", rawTextLength: 20, renderedTextLength: 20, contentVisibility: 100, error: null },
    { url: "https://neodigm.com/c", status: "failed", rawTextLength: 0, renderedTextLength: 0, contentVisibility: 0, error: "timeout" },
  ],
};
const job = (status: string, item: Record<string, unknown> = {}, log: string[] = []) =>
  json({ job: { id: "cjob-1", status, log, items: [{ keyword: "k", status: status === "done" ? "done" : "running", results: 3, error: null, ...item }] } });

test("agent status: progress maps to stages while the crawl runs", async () => {
  mockFetch({ "/jobs/cjob-1": () => job("running", {}, ["STAGE:parse_sitemap"]) });
  assert.equal((await getSitemapCrawlStatus("agent:cjob-1"))?.stage, "sitemap");
  mockFetch({ "/jobs/cjob-1": () => job("running", {}, ["STAGE:parse_sitemap", "진행 2/20"]) });
  const status = await getSitemapCrawlStatus("agent:cjob-1");
  assert.equal(status?.stage, "crawl");
  assert.equal(status?.done, false);
});

test("agent status: a finished crawl is uploaded exactly once even when polled concurrently", async () => {
  let imports = 0;
  const calls = mockFetch({
    "/jobs/cjob-done/crawl": () => json({ crawls: [crawlResult] }),
    "/jobs/cjob-done/applied": () => json({ ok: true }),
    "/jobs/cjob-done": () => json({ job: { id: "cjob-done", status: "done", log: [], items: [{ keyword: "k", status: "done", results: 3, error: null }] } }),
    "/api/sitemap-crawl/import": () => {
      imports++;
      return json({ imported: 1, urlCount: 3 });
    },
  });
  const [a, b] = await Promise.all([getSitemapCrawlStatus("agent:cjob-done"), getSitemapCrawlStatus("agent:cjob-done")]);
  assert.equal(imports, 1);
  assert.equal(a?.stage, "done");
  assert.deepEqual(a?.result && { count: a.result.urlCount, avg: a.result.averageContentVisibility }, { count: 3, avg: 75 }, "average ignores failed pages");
  assert.deepEqual(b?.result?.urlCount, 3);
  assert.ok(calls.some((c) => c.url.endsWith("/applied")), "the collector is told the job was applied");
});

test("agent status: a failed upload, a crawl error and a cancelled job all end in an error", async () => {
  mockFetch({
    "/jobs/cjob-a/crawl": () => json({ crawls: [crawlResult] }),
    "/jobs/cjob-a": () => json({ job: { id: "cjob-a", status: "done", log: [], items: [{ keyword: "k", status: "done", results: 3, error: null }] } }),
    "/api/sitemap-crawl/import": () => json({ error: "저장 실패" }, 400),
  });
  const upload = await getSitemapCrawlStatus("agent:cjob-a");
  assert.deepEqual([upload?.stage, upload?.done, upload?.error], ["error", true, "저장 실패"]);

  mockFetch({ "/jobs/cjob-b": () => job("done", { status: "error", error: "크롤에 실패했습니다." }) });
  assert.equal((await getSitemapCrawlStatus("agent:cjob-b"))?.error, "크롤에 실패했습니다.");

  mockFetch({ "/jobs/cjob-c": () => job("cancelled") });
  assert.equal((await getSitemapCrawlStatus("agent:cjob-c"))?.stage, "error");
});

test("agent status: an unreachable collector during polling is retried, not treated as failure", async () => {
  mockFetch({ "/jobs/cjob-x": () => { throw new Error("connection refused"); } });
  assert.equal(await getSitemapCrawlStatus("agent:cjob-x"), null);
});

test("server job ids keep using the server status route", async () => {
  mockFetch({ "/api/sitemap-crawl/status": () => json({ stage: "crawl", log: [], error: null, result: null, done: false }) });
  assert.equal((await getSitemapCrawlStatus("sitemap-job-1"))?.stage, "crawl");
  assert.ok(COLLECTOR_SETUP_EVENT.startsWith("neodio:"));
});
