import test from "node:test";
import assert from "node:assert/strict";
import { apacheCombinedAdapter, createCloudflareAdapter, vercelAdapter } from "./adapters";
import { classifyEvent } from "./classify";
import { IpTrustAccumulator } from "./ipTrust";
import { UA, makeCtx } from "./testing";
import type { NormalizedEvent } from "./types";

test("알려진 봇 + 범위 안 IP → 검증된 학습 크롤러", () => {
  const r = classifyEvent({ ua: UA.gptbot, ip: "132.196.86.10" }, makeCtx());
  assert.equal(r.kind, "known-bot");
  assert.equal(r.operator, "OpenAI");
  assert.equal(r.purpose, "training");
  assert.equal(r.authenticity, "verified");
});

test("사용자 요청 가져오기 에이전트를 학습·검색 크롤러와 구분한다", () => {
  const ctx = makeCtx();
  assert.equal(classifyEvent({ ua: UA.chatgptUser, ip: "203.0.113.5" }, ctx).purpose, "user-fetch");
  assert.equal(classifyEvent({ ua: UA.claudeUser, ip: "216.73.216.5" }, ctx).purpose, "user-fetch");
  assert.equal(classifyEvent({ ua: UA.perplexityUser, ip: "18.97.1.228" }, ctx).purpose, "user-fetch");
  assert.equal(classifyEvent({ ua: UA.oaiSearch, ip: "198.51.100.5" }, ctx).purpose, "search-index");
  assert.equal(classifyEvent({ ua: UA.claudeBot, ip: "216.73.216.5" }, ctx).purpose, "training");
});

test("위장: 봇 UA를 쓰지만 공개 범위 밖 IP", () => {
  const r = classifyEvent({ ua: UA.gptbot, ip: "8.8.8.8" }, makeCtx());
  assert.equal(r.kind, "known-bot");
  assert.equal(r.authenticity, "suspicious");
  assert.equal(r.authReason, "ip-outside-ranges");
});

test("일반 브라우저와 빈 UA는 regular", () => {
  assert.equal(classifyEvent({ ua: UA.chrome, ip: "8.8.8.8" }, makeCtx()).kind, "regular");
  assert.equal(classifyEvent({ ua: "", ip: undefined }, makeCtx()).kind, "regular");
});

test("레지스트리에 없는 봇 같은 UA는 수신함 후보(버전은 정규화)", () => {
  const r = classifyEvent({ ua: "NewAIcrawler/3.2.1 (+https://example.org/bot)", ip: "8.8.8.8" }, makeCtx());
  assert.equal(r.kind, "bot-candidate");
  assert.equal(r.inboxKey, "NewAIcrawler/N (+https://example.org/bot)");
});

test("토큰 경계 때문에 일치하지 않는 변형도 수신함으로 간다", () => {
  const ctx = makeCtx();
  assert.equal(classifyEvent({ ua: "xGPTBot/1.0", ip: "8.8.8.8" }, ctx).kind, "bot-candidate");
  assert.equal(classifyEvent({ ua: "Googlebot-Image/1.0", ip: "8.8.8.8" }, ctx).kind, "bot-candidate");
  // 같은 변형이 Google 공개 IP에서 오면 '운영사 IP인데 모르는 UA' — 신규 변형 발견 단서로 더 강하다
  const fromGoogle = classifyEvent({ ua: "Googlebot-Image/1.0", ip: "66.249.64.5" }, ctx);
  assert.equal(fromGoogle.kind, "operator-ip-unknown-ua");
  assert.equal(fromGoogle.operator, "Google");
});

test("운영사 공개 IP에서 온 모르는 UA → 신규 봇 발견 단서", () => {
  // 브라우저처럼 위장한 UA라도 OpenAI 공개 대역에서 오면 표시한다
  const r = classifyEvent({ ua: UA.chrome, ip: "132.196.86.200" }, makeCtx());
  assert.equal(r.kind, "operator-ip-unknown-ua");
  assert.equal(r.operator, "OpenAI");
  assert.ok(r.inboxKey);
});

test("목적 불일치는 분류 결과에 그대로 드러난다", () => {
  const r = classifyEvent({ ua: UA.gptbot, ip: "203.0.113.5" }, makeCtx());
  assert.equal(r.authenticity, "verified");
  assert.equal(r.purposeMismatch, true);
});

test("네이버 검색로봇: 분류는 하되 진위는 항상 검증 불가", () => {
  const r = classifyEvent({ ua: UA.yeti, ip: "203.0.113.50" }, makeCtx());
  assert.equal(r.kind, "known-bot");
  assert.equal(r.operator, "Naver");
  assert.equal(r.authenticity, "unverifiable");
  assert.equal(r.authReason, "no-range-source");
});

// ── 여러 형식을 거친 통합 시험 ───────────────────────────────────────
test("세 가지 형식의 같은 사건이 같은 분류 결과를 낸다", () => {
  const combined =
    '132.196.86.10 - - [05/Nov/2026:09:12:44 +0900] "GET /pricing HTTP/1.1" 200 1 "-" "' + UA.gptbot + '"';
  const cloudflare = JSON.stringify({
    ClientRequestUserAgent: UA.gptbot,
    ClientIP: "132.196.86.10",
    ClientRequestPath: "/pricing",
    EdgeResponseStatus: 200,
    EdgeStartTimestamp: "2026-11-05T00:12:44Z",
  });
  const vercel = JSON.stringify({
    proxy: { timestamp: Date.UTC(2026, 10, 5, 0, 12, 44), method: "GET", host: "e.com", path: "/pricing", userAgent: [UA.gptbot], clientIp: "132.196.86.10", statusCode: 200 },
  });
  const events: NormalizedEvent[] = [
    apacheCombinedAdapter.parseLine(combined),
    createCloudflareAdapter().parseLine(cloudflare),
    vercelAdapter.parseLine(vercel),
  ].map((o) => {
    assert.equal(o.ok, true);
    if (!o.ok) throw new Error("unreachable");
    return o.event;
  });
  const results = events.map((e) => classifyEvent(e, makeCtx()));
  for (const r of results) {
    assert.equal(r.botId, "openai-gptbot");
    assert.equal(r.authenticity, "verified");
  }
  assert.equal(new Set(events.map((e) => e.path)).size, 1);
  assert.equal(new Set(events.map((e) => e.timeMs)).size, 1);
});

test("프록시 뒤 로그: 점검이 의심을 내면 어떤 봇도 '검증됨/의심'이 되지 않는다", () => {
  const acc = new IpTrustAccumulator();
  for (let i = 0; i < 600; i++) acc.add(i % 2 ? "172.16.0.1" : "172.16.0.2", `Browser-${i % 40}`);
  const trust = acc.report().status;
  assert.equal(trust, "suspected-proxy");
  const ctx = makeCtx({ ipTrust: trust });
  const r = classifyEvent({ ua: UA.gptbot, ip: "172.16.0.1" }, ctx);
  assert.equal(r.authenticity, "unverifiable");
  assert.equal(r.authReason, "proxy-ip-suspected");
});

test("목록이 낡았을 때: 같은 사건이 '검증됨'이 아니라 '검증 불가'로 바뀐다", () => {
  const fresh = classifyEvent({ ua: UA.claudeBot, ip: "216.73.216.5" }, makeCtx());
  const stale = classifyEvent({ ua: UA.claudeBot, ip: "216.73.216.5" }, makeCtx({ stale: ["anthropic-bots"] }));
  assert.equal(fresh.authenticity, "verified");
  assert.equal(stale.authenticity, "unverifiable");
  assert.equal(stale.authReason, "ranges-stale");
});
