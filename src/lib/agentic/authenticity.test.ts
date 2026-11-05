import test from "node:test";
import assert from "node:assert/strict";
import { judgeAuthenticity, operatorOfIp } from "./authenticity";
import { BOT_ENTRIES } from "./registry";
import { makeCtx } from "./testing";

const entry = (id: string) => {
  const e = BOT_ENTRIES.find((x) => x.id === id);
  assert.ok(e, id);
  return e;
};

// 명세 §6 ③ 판정표를 행 하나씩 확인한다.

test("검증됨: UA 일치 + 신선한 목록 + IP가 범위 안", () => {
  const r = judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", makeCtx());
  assert.deepEqual(r, { authenticity: "verified", reason: "ok", matchedSourceId: "openai-gptbot" });
});

test("의심: UA 일치 + 신선한 목록 + 신뢰할 수 있는 IP가 어느 공개 범위에도 없음", () => {
  const r = judgeAuthenticity(entry("openai-gptbot"), "8.8.8.8", makeCtx());
  assert.equal(r.authenticity, "suspicious");
  assert.equal(r.reason, "ip-outside-ranges");
});

test("목적 불일치: 같은 운영사의 다른 목적 목록에만 있으면 검증됨으로 취급하되 표시", () => {
  // GPTBot UA인데 IP는 ChatGPT-User 대역
  const r = judgeAuthenticity(entry("openai-gptbot"), "203.0.113.77", makeCtx());
  // makeCtx의 chatgpt-user 목록이 203.0.113.0/24이므로 의심이 아니라 purpose-mismatch여야 한다
  assert.equal(r.authenticity, "verified");
  assert.equal(r.reason, "purpose-mismatch");
  assert.equal(r.purposeMismatch, true);
  assert.equal(r.matchedSourceId, "openai-chatgpt-user");
});

test("의심은 다른 운영사 대역에서 오면 그대로 의심", () => {
  // GPTBot UA인데 IP는 Anthropic 대역 → 운영사가 다르므로 목적 불일치가 아니라 의심
  const r = judgeAuthenticity(entry("openai-gptbot"), "216.73.216.5", makeCtx());
  assert.equal(r.authenticity, "suspicious");
});

test("검증 불가: IP 없음 / 해석 불가", () => {
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), undefined, makeCtx()).reason, "no-ip");
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "not-an-ip", makeCtx()).reason, "no-ip");
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", makeCtx({ ipTrust: "no-ip" })).reason, "no-ip");
});

test("검증 불가: 공개 목록이 없는 봇(네이버)은 언제나", () => {
  const r = judgeAuthenticity(entry("naver-yeti"), "203.0.113.5", makeCtx());
  assert.equal(r.authenticity, "unverifiable");
  assert.equal(r.reason, "no-range-source");
});

test("검증 불가: 목록이 없음 / 낡음 / 스키마 무효", () => {
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", makeCtx({ skip: ["openai-gptbot"] })).reason, "ranges-missing");
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", makeCtx({ stale: ["openai-gptbot"] })).reason, "ranges-stale");
  const ctx = makeCtx();
  ctx.ranges.setInvalid("openai-gptbot", "bad-entry");
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", ctx).reason, "ranges-schema-invalid");
});

test("낡은 목록에서는 '포함'이어도 검증하지 않는다(보수적)", () => {
  // 낡음 → 쓸 수 있는 목록이 없으므로 검증 불가. 낡은 목록의 일치를 근거로 삼지 않는다.
  const r = judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", makeCtx({ stale: ["openai-gptbot"] }));
  assert.equal(r.authenticity, "unverifiable");
});

test("일부 목록만 쓸 수 있으면: 포함이면 검증됨, 아니면 '범위 밖'이라 단정하지 않는다", () => {
  const googlebot = entry("google-googlebot");
  const ctx = makeCtx({ skip: ["google-common-crawlers"] });
  assert.equal(judgeAuthenticity(googlebot, "66.249.64.5", ctx).authenticity, "verified");
  const outside = judgeAuthenticity(googlebot, "203.0.113.5", ctx);
  assert.equal(outside.authenticity, "unverifiable");
  assert.equal(outside.reason, "ranges-partial");
});

test("프록시 IP 의심 시 전부 검증 불가(검증됨도 내주지 않는다)", () => {
  const r = judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", makeCtx({ ipTrust: "suspected-proxy" }));
  assert.equal(r.authenticity, "unverifiable");
  assert.equal(r.reason, "proxy-ip-suspected");
});

test("로그가 작아 IP 신뢰를 모를 때: 검증됨은 유지, 범위 밖은 의심이 아니라 검증 불가", () => {
  const ctx = makeCtx({ ipTrust: "insufficient-sample" });
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10", ctx).authenticity, "verified");
  const out = judgeAuthenticity(entry("openai-gptbot"), "198.51.100.9", ctx);
  // 198.51.100.0/24는 OpenAI의 다른 목적 목록(searchbot)에 있으므로 목적 불일치 검증됨
  assert.equal(out.reason, "purpose-mismatch");
  const away = judgeAuthenticity(entry("openai-gptbot"), "8.8.8.8", ctx);
  assert.equal(away.authenticity, "unverifiable");
  assert.equal(away.reason, "ip-trust-unknown");
});

test("IPv6와 IPv4-mapped 표기", () => {
  const ctx = makeCtx();
  assert.equal(judgeAuthenticity(entry("google-googlebot"), "2001:4860:4801:10::1", ctx).authenticity, "verified");
  assert.equal(judgeAuthenticity(entry("google-googlebot"), "2001:4860:4801:11::1", ctx).authenticity, "suspicious");
  // 같은 IPv4를 mapped IPv6로 적은 로그
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "::ffff:132.196.86.10", ctx).authenticity, "verified");
  assert.equal(judgeAuthenticity(entry("openai-gptbot"), "132.196.86.10:51234", ctx).authenticity, "verified");
});

test("Anthropic: 세 봇이 같은 목록으로 IP만 검증하고 목적은 UA가 정한다", () => {
  const ctx = makeCtx();
  for (const id of ["anthropic-claudebot", "anthropic-searchbot", "anthropic-user"]) {
    assert.equal(judgeAuthenticity(entry(id), "216.73.217.9", ctx).authenticity, "verified", id);
  }
});

test("operatorOfIp: UA를 몰라도 IP로 운영사를 역추적", () => {
  const ctx = makeCtx();
  assert.equal(operatorOfIp("132.196.86.10", ctx), "OpenAI");
  assert.equal(operatorOfIp("216.73.216.9", ctx), "Anthropic");
  assert.equal(operatorOfIp("2001:4860:4801:10::9", ctx), "Google");
  assert.equal(operatorOfIp("8.8.8.8", ctx), null);
  assert.equal(operatorOfIp(undefined, ctx), null);
  // 프록시 의심이면 역추적하지 않는다
  assert.equal(operatorOfIp("132.196.86.10", makeCtx({ ipTrust: "suspected-proxy" })), null);
  // 낡은 목록은 쓰지 않는다
  assert.equal(operatorOfIp("132.196.86.10", makeCtx({ stale: ["openai-gptbot"] })), null);
});
