import test from "node:test";
import assert from "node:assert/strict";
import {
  apacheCombinedAdapter,
  createApacheCombinedAdapter,
  createCloudflareAdapter,
  createCsvAdapter,
  detectDelimiter,
  parseCsvRow,
  splitJsonArrayRecords,
  suggestCsvMapping,
  vercelAdapter,
} from "./adapters";
import type { NormalizedEvent, ParseOutcome } from "./types";

function ok(outcome: ParseOutcome): NormalizedEvent {
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  if (!outcome.ok) throw new Error("unreachable");
  return outcome.event;
}
function reason(outcome: ParseOutcome): string {
  assert.equal(outcome.ok, false);
  return outcome.ok ? "" : outcome.reason;
}

const T0 = Date.UTC(2026, 10, 5, 0, 12, 44);

// ── Apache/Nginx combined ──────────────────────────────────────────────
const COMBINED_LINE =
  '132.196.86.10 - - [05/Nov/2026:09:12:44 +0900] "GET /pricing?utm=x HTTP/1.1" 200 18342 "-" "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"';

test("combined: 필드를 정규화한다(시각은 UTC, 쿼리 제거)", () => {
  const e = ok(apacheCombinedAdapter.parseLine(COMBINED_LINE));
  assert.equal(e.timeMs, T0);
  assert.equal(e.path, "/pricing");
  assert.equal(e.status, 200);
  assert.equal(e.method, "GET");
  assert.equal(e.ip, "132.196.86.10");
  assert.equal(e.kind, "page");
  assert.equal(e.host, undefined); // combined에는 호스트가 없다
  assert.match(e.ua, /GPTBot\/1\.1/);
});

test("combined: 이스케이프된 따옴표가 든 UA, IPv6, 절대 URL 요청줄, HEAD", () => {
  const quoted = '2001:db8::7 - - [05/Nov/2026:09:12:44 +0900] "HEAD http://example.com/a/b?q=1 HTTP/1.1" 301 0 "-" "Weird \\"agent\\" 1.0"';
  const e = ok(apacheCombinedAdapter.parseLine(quoted));
  assert.equal(e.ip, "2001:db8::7");
  assert.equal(e.method, "HEAD");
  assert.equal(e.path, "/a/b");
  assert.equal(e.ua, 'Weird "agent" 1.0');
  assert.equal(e.status, 301);
});

test("combined: 크기가 '-'인 줄과 IP가 '-'인 줄", () => {
  const e = ok(apacheCombinedAdapter.parseLine('- - - [05/Nov/2026:09:12:44 +0900] "GET /x HTTP/1.1" 304 - "-" "UA"'));
  assert.equal(e.ip, undefined);
  assert.equal(e.status, 304);
});

test("combined: common 형식(UA 없음)은 분류 불가 사유로 돌려준다", () => {
  const common = '132.196.86.10 - - [05/Nov/2026:09:12:44 +0900] "GET /pricing HTTP/1.1" 200 18342';
  assert.equal(reason(apacheCombinedAdapter.parseLine(common)), "no-user-agent");
});

test("combined: 오류 줄은 이유와 함께 거절한다", () => {
  assert.equal(reason(apacheCombinedAdapter.parseLine("그냥 텍스트")), "malformed");
  assert.equal(reason(apacheCombinedAdapter.parseLine('1.2.3.4 - - [05/Foo/2026:09:12:44 +0900] "GET / HTTP/1.1" 200 1 "-" "UA"')), "bad-time");
  assert.equal(reason(apacheCombinedAdapter.parseLine('1.2.3.4 - - [05/Nov/2026:09:12:44 +0900] "-" 400 0 "-" "-"')), "malformed");
  assert.equal(reason(apacheCombinedAdapter.parseLine('1.2.3.4 - - [05/Nov/2026:09:12:44 +0900] "GET / HTTP/1.1" - 0 "-" "UA"')), "bad-status");
});

test("combined: 시각에 오프셋이 없으면 시간대를 요구하고, 알려 주면 해석한다", () => {
  const naive = '1.2.3.4 - - [05/Nov/2026:09:12:44] "GET / HTTP/1.1" 200 1 "-" "UA"';
  assert.equal(reason(apacheCombinedAdapter.parseLine(naive)), "time-needs-timezone");
  assert.equal(ok(createApacheCombinedAdapter(540).parseLine(naive)).timeMs, T0);
});

// ── Cloudflare ─────────────────────────────────────────────────────────
const cf = createCloudflareAdapter();

test("cloudflare: 문서로 확인한 필드를 읽는다", () => {
  const row = JSON.stringify({
    ClientRequestUserAgent: "Mozilla/5.0 (compatible; GPTBot/1.1)",
    ClientIP: "132.196.86.10",
    ClientRequestHost: "Example.com",
    ClientRequestPath: "/pricing",
    EdgeResponseStatus: 200,
    EdgeStartTimestamp: "2026-11-05T00:12:44Z",
    VerifiedBotCategory: "AI Crawler",
  });
  const e = ok(cf.parseLine(row));
  assert.equal(e.timeMs, T0);
  assert.equal(e.host, "example.com");
  assert.equal(e.path, "/pricing");
  assert.equal(e.method, "UNKNOWN"); // 메서드 필드는 확인하지 못해 있으면 쓰고 없으면 UNKNOWN
  assert.deepEqual(e.extra, { cloudflareVerifiedBotCategory: "AI Crawler" });
});

test("cloudflare: 숫자 타임스탬프(나노초)와 메서드 필드", () => {
  const row = JSON.stringify({
    ClientRequestUserAgent: "UA",
    ClientRequestPath: "/a?x=1",
    EdgeResponseStatus: 404,
    EdgeStartTimestamp: 1762301564000000000,
    ClientRequestMethod: "get",
  });
  const e = ok(cf.parseLine(row));
  assert.equal(e.timeMs, 1_762_301_564_000);
  assert.equal(e.method, "GET");
  assert.equal(e.path, "/a");
});

test("cloudflare: 시간대 없는 시각은 가정이 있을 때만 해석", () => {
  const row = JSON.stringify({ ClientRequestUserAgent: "UA", ClientRequestPath: "/", EdgeResponseStatus: 200, EdgeStartTimestamp: "2026-11-05 09:12:44" });
  assert.equal(reason(cf.parseLine(row)), "time-needs-timezone");
  assert.equal(ok(createCloudflareAdapter(540).parseLine(row)).timeMs, T0);
});

test("cloudflare: 다른 JSON·깨진 줄은 거절", () => {
  assert.equal(reason(cf.parseLine('{"foo":1}')), "malformed");
  assert.equal(reason(cf.parseLine("{깨짐")), "malformed");
  assert.equal(reason(cf.parseLine(JSON.stringify({ ClientRequestUserAgent: "UA", ClientRequestPath: "/", EdgeResponseStatus: "x", EdgeStartTimestamp: 1762301564 }))), "bad-status");
});

// ── Vercel ─────────────────────────────────────────────────────────────
const VERCEL_ROW = {
  id: "1",
  source: "lambda",
  host: "my-app.vercel.app",
  timestamp: 1762301564283,
  proxy: { timestamp: 1762301564172, method: "GET", host: "My-App.vercel.app", path: "/api/users?page=1", userAgent: ["Mozilla/5.0 (compatible; ClaudeBot/1.0)"], clientIp: "216.73.216.5", statusCode: 200 },
};

test("vercel: proxy 객체에서 읽는다(UA는 배열의 첫 값)", () => {
  const e = ok(vercelAdapter.parseLine(JSON.stringify(VERCEL_ROW)));
  assert.equal(e.timeMs, 1_762_301_564_172);
  assert.equal(e.host, "my-app.vercel.app");
  assert.equal(e.path, "/api/users");
  assert.equal(e.ip, "216.73.216.5");
  assert.match(e.ua, /ClaudeBot/);
});

test("vercel: 요청이 아닌 줄과 재검증 줄은 이유와 함께 건너뛴다", () => {
  assert.equal(reason(vercelAdapter.parseLine(JSON.stringify({ source: "build", message: "Build completed" }))), "not-applicable");
  assert.equal(reason(vercelAdapter.parseLine(JSON.stringify({ ...VERCEL_ROW, proxy: { ...VERCEL_ROW.proxy, statusCode: -1 } }))), "revalidation");
  assert.equal(reason(vercelAdapter.parseLine(JSON.stringify({ ...VERCEL_ROW, proxy: { ...VERCEL_ROW.proxy, userAgent: [] } }))), "no-user-agent");
});

test("JSON 배열 파일을 줄 단위 레코드로 푼다", () => {
  const text = JSON.stringify([VERCEL_ROW, { source: "build" }]);
  const records = splitJsonArrayRecords(text);
  assert.equal(records?.length, 2);
  assert.equal(ok(vercelAdapter.parseLine(records![0])).path, "/api/users");
  assert.equal(splitJsonArrayRecords('{"a":1}'), null);
  assert.equal(splitJsonArrayRecords("[깨짐"), null);
});

// ── CSV ────────────────────────────────────────────────────────────────
test("CSV: 헤더 동의어로 열 매핑을 제안하고 필수 열이 빠지면 알린다", () => {
  const full = suggestCsvMapping(["timestamp", "host", "path", "status", "user_agent", "client_ip", "method"]);
  assert.deepEqual(full.missing, []);
  assert.deepEqual(full.mapping, { time: 0, host: 1, path: 2, status: 3, ua: 4, ip: 5, method: 6 });

  const partial = suggestCsvMapping(["Time", "Request Path", "Status Code"]);
  assert.deepEqual(partial.missing, ["ua"]);

  const logstash = suggestCsvMapping(["@timestamp", "cs-uri-stem", "sc-status", "cs(User-Agent)", "c-ip"]);
  assert.deepEqual(logstash.missing, []);
});

test("CSV: 따옴표·이중 따옴표·구분자 감지", () => {
  assert.deepEqual(parseCsvRow('a,"b,c","d ""q"" e",', ","), ["a", "b,c", 'd "q" e', ""]);
  assert.equal(detectDelimiter("a\tb\tc\td"), "\t");
  assert.equal(detectDelimiter("a;b;c;d"), ";");
  assert.equal(detectDelimiter("a,b,c,d"), ",");
  assert.equal(detectDelimiter("한 칸"), ",");
});

test("CSV: 매핑대로 읽고 시간대 없는 시각은 가정이 있을 때만", () => {
  const mapping = { time: 0, host: 1, path: 2, status: 3, ua: 4, ip: 5, method: 6 };
  const line = '2026-11-05T00:12:44Z,example.com,/pricing,200,"Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",132.196.86.10,GET';
  const e = ok(createCsvAdapter(mapping).parseLine(line));
  assert.equal(e.timeMs, T0);
  assert.equal(e.method, "GET");
  assert.equal(e.host, "example.com");

  const naive = '2026-11-05 09:12:44,example.com,/x,200,UA,1.2.3.4,GET';
  assert.equal(reason(createCsvAdapter(mapping).parseLine(naive)), "time-needs-timezone");
  assert.equal(ok(createCsvAdapter(mapping, { assumeOffsetMinutes: 540 }).parseLine(naive)).timeMs, T0);

  const tab = createCsvAdapter({ time: 0, path: 1, status: 2, ua: 3 }, { delimiter: "\t" });
  assert.equal(ok(tab.parseLine("1762301564\t/a\t200\tUA")).path, "/a");
  assert.equal(reason(tab.parseLine("1762301564\t/a\t999\tUA")), "bad-status");
  assert.equal(reason(createCsvAdapter({ time: 0, path: 1, status: 2, ua: 9 }).parseLine("1762301564,/a,200")), "malformed");
});
