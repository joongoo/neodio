import test from "node:test";
import assert from "node:assert/strict";
import { detectFormat } from "./detect";

const combined = (i: number) =>
  `132.196.86.${i} - - [05/Nov/2026:09:12:${String(i % 60).padStart(2, "0")} +0900] "GET /p${i} HTTP/1.1" 200 100 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"`;
const common = (i: number) => `132.196.86.${i} - - [05/Nov/2026:09:12:${String(i % 60).padStart(2, "0")} +0900] "GET /p${i} HTTP/1.1" 200 100`;
const cloudflare = (i: number) =>
  JSON.stringify({ ClientRequestUserAgent: "UA", ClientIP: "1.2.3.4", ClientRequestHost: "e.com", ClientRequestPath: `/p${i}`, EdgeResponseStatus: 200, EdgeStartTimestamp: "2026-11-05T00:12:44Z" });
const vercel = (i: number) =>
  JSON.stringify({ source: "lambda", proxy: { timestamp: 1762301564172 + i, method: "GET", host: "e.com", path: `/p${i}`, userAgent: ["UA"], clientIp: "1.2.3.4", statusCode: 200 } });

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("combined / cloudflare / vercel을 구분해 감지한다", () => {
  const c = detectFormat(range(20).map(combined));
  assert.equal(c.status, "detected");
  if (c.status === "detected") {
    assert.equal(c.format, "apache-combined");
    assert.equal(c.confidence, 1);
    assert.equal(c.needsUserConfirmation, false);
  }
  const f = detectFormat(range(20).map(cloudflare));
  assert.equal(f.status === "detected" && f.format, "cloudflare-logpush");
  const v = detectFormat(range(20).map(vercel));
  assert.equal(v.status === "detected" && v.format, "vercel-log-drain");
});

test("Vercel: 요청이 아닌 빌드 로그가 섞여도 확신이 낮아지지 않는다", () => {
  const lines = [...range(10).map(vercel), ...range(10).map((i) => JSON.stringify({ source: "build", message: `step ${i}` }))];
  const r = detectFormat(lines);
  assert.equal(r.status, "detected");
  if (r.status === "detected") {
    assert.equal(r.format, "vercel-log-drain");
    assert.equal(r.confidence, 1);
    assert.equal(r.needsUserConfirmation, false);
  }
});

test("common 형식(UA 없음)은 지원 불가로 알린다", () => {
  const r = detectFormat(range(20).map(common));
  assert.equal(r.status, "unsupported-no-user-agent");
  if (r.status === "unsupported-no-user-agent") assert.match(r.message, /combined/);
});

test("CSV는 헤더가 있고 필수 열이 매핑되면 감지하되 항상 사용자 확인을 요구", () => {
  const header = "timestamp,host,path,status,user_agent,client_ip,method";
  const rows = range(10).map((i) => `2026-11-05T00:12:${String(i).padStart(2, "0")}Z,e.com,/p${i},200,UA,1.2.3.4,GET`);
  const r = detectFormat([header, ...rows]);
  assert.equal(r.status, "detected");
  if (r.status === "detected") {
    assert.equal(r.format, "csv");
    assert.equal(r.needsUserConfirmation, true);
    assert.equal(r.csv?.delimiter, ",");
    assert.deepEqual(r.csv?.missing, []);
  }
});

test("CSV: 필수 열이 빠지면 감지하지 않고 알 수 없음으로 돌려 사용자 매핑을 유도", () => {
  const r = detectFormat(["time,path,status,note", "2026-11-05T00:12:44Z,/a,200,x", "2026-11-05T00:12:45Z,/b,200,y"]);
  assert.equal(r.status, "unknown");
});

test("섞인 표본은 확정하지 않고 확인을 요구한다", () => {
  const lines = [...range(8).map(combined), ...range(2).map(() => "깨진 줄")];
  const r = detectFormat(lines);
  assert.equal(r.status, "detected");
  if (r.status === "detected") assert.equal(r.needsUserConfirmation, false); // 0.8 이상이면 확인 불필요
  const worse = detectFormat([...range(6).map(combined), ...range(4).map(() => "깨진 줄")]);
  assert.equal(worse.status === "detected" && worse.needsUserConfirmation, true);
});

test("형식은 맞는데 시각에 시간대가 없으면 형식은 알리고 시간대를 묻는다", () => {
  const naive = (i: number) => `1.2.3.${i} - - [05/Nov/2026:09:12:${String(i % 60).padStart(2, "0")}] "GET /p${i} HTTP/1.1" 200 1 "-" "UA"`;
  const r = detectFormat(range(10).map(naive));
  assert.equal(r.status, "detected");
  if (r.status === "detected") {
    assert.equal(r.format, "apache-combined");
    assert.equal(r.needsTimezone, true);
    assert.equal(r.needsUserConfirmation, true);
  }
  // 시간대를 알려 주면 확인 없이 감지된다
  const known = detectFormat(range(10).map(naive), { assumeOffsetMinutes: 540 });
  assert.equal(known.status === "detected" && known.needsTimezone, undefined);
  assert.equal(known.status === "detected" && known.needsUserConfirmation, false);
});

test("읽히는 줄이 없거나 표본이 비면 추측하지 않는다", () => {
  assert.equal(detectFormat(["아무거나", "텍스트"]).status, "unknown");
  assert.equal(detectFormat([]).status, "unknown");
  assert.equal(detectFormat(["", "  ", "\r"]).status, "unknown");
});

test("CRLF 줄바꿈 표본도 처리한다", () => {
  const r = detectFormat(range(5).map((i) => `${combined(i)}\r`));
  assert.equal(r.status === "detected" && r.format, "apache-combined");
});
