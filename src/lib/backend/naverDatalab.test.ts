import assert from "node:assert/strict";
import test from "node:test";
import { clearSearchTrendCache, DatalabError, fetchSearchTrend, SearchTrendRequest } from "./naverDatalab";

const realFetch = globalThis.fetch;
const realEnv = { id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET };
function restoreEnv(name: "NAVER_CLIENT_ID" | "NAVER_CLIENT_SECRET", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
test.afterEach(() => {
  clearSearchTrendCache();
  globalThis.fetch = realFetch;
  restoreEnv("NAVER_CLIENT_ID", realEnv.id);
  restoreEnv("NAVER_CLIENT_SECRET", realEnv.secret);
});

const base: SearchTrendRequest = {
  startDate: "2026-01-01",
  endDate: "2026-03-01",
  timeUnit: "month",
  keywordGroups: [{ groupName: "네오다임", keywords: ["네오다임", "Neodigm"] }],
};

test("request goes to the API HUB search-trend URL with NCP headers and omits empty filters", async () => {
  process.env.NAVER_CLIENT_ID = "id";
  process.env.NAVER_CLIENT_SECRET = "secret";
  let seen: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
    return new Response(
      JSON.stringify({
        startDate: "2026-01-01",
        endDate: "2026-03-01",
        timeUnit: "month",
        results: [{ title: "네오다임", keywords: ["네오다임", "Neodigm"], data: [{ period: "2026-01-01", ratio: 70.15342 }, { period: "2026-02-01", ratio: 100 }] }],
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const result = await fetchSearchTrend({ ...base, ages: [], device: "pc" });

  assert.equal(seen?.url, "https://naverapihub.apigw.ntruss.com/search-trend/v1/search");
  assert.equal(seen?.headers.get("x-ncp-apigw-api-key-id"), "id");
  assert.equal(seen?.headers.get("x-ncp-apigw-api-key"), "secret");
  assert.equal(seen?.body.device, "pc");
  assert.equal("ages" in (seen?.body ?? {}), false);
  assert.equal("gender" in (seen?.body ?? {}), false);
  assert.equal(result.results[0].title, "네오다임");
  assert.equal(result.results[0].data[1].ratio, 100);
});

test("errors map to DatalabError without leaking credentials", async () => {
  process.env.NAVER_CLIENT_ID = "id";
  process.env.NAVER_CLIENT_SECRET = "secret";

  globalThis.fetch = (async () => new Response(JSON.stringify({ errorMessage: "Invalid startDate" }), { status: 400 })) as typeof fetch;
  await assert.rejects(fetchSearchTrend(base), (e: DatalabError) => e.code === "invalid-request" && e.message === "Invalid startDate");

  globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
  await assert.rejects(fetchSearchTrend(base), (e: DatalabError) => e.code === "quota" && e.status === 429);

  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  await assert.rejects(fetchSearchTrend(base), (e: DatalabError) => e.status === 502 && !e.message.includes("secret"));
});

test("missing credentials fail before any network call", async () => {
  delete process.env.NAVER_CLIENT_ID;
  delete process.env.NAVER_CLIENT_SECRET;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch;
  await assert.rejects(fetchSearchTrend(base), (e: DatalabError) => e.code === "not-configured");
  assert.equal(called, false);
});

test("identical requests are served from cache; failures are not cached", async () => {
  process.env.NAVER_CLIENT_ID = "id";
  process.env.NAVER_CLIENT_SECRET = "secret";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }) as typeof fetch;
  await fetchSearchTrend(base);
  await fetchSearchTrend(base);
  assert.equal(calls, 1);
  await fetchSearchTrend({ ...base, device: "mo" });
  assert.equal(calls, 2);

  clearSearchTrendCache();
  globalThis.fetch = (async () => {
    calls++;
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  await assert.rejects(fetchSearchTrend(base));
  await assert.rejects(fetchSearchTrend(base));
  assert.equal(calls, 4);
});
