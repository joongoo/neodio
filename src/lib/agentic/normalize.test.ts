import test from "node:test";
import assert from "node:assert/strict";
import { kindOfPath, maskIdSegments, normalizeHost, normalizePath, parseClfTime, parseFlexibleTime } from "./normalize";

test("normalizePath: 쿼리·프래그먼트 제거와 슬래시 정리", () => {
  assert.equal(normalizePath("/pricing?utm=1&token=abc"), "/pricing");
  assert.equal(normalizePath("/docs/a#section"), "/docs/a");
  assert.equal(normalizePath("//docs///a//"), "/docs/a");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath(""), "/");
  assert.equal(normalizePath("pricing"), "/pricing");
});

test("normalizePath: 절대 URL 요청줄은 경로만 취한다", () => {
  assert.equal(normalizePath("http://example.com/a/b?x=1"), "/a/b");
  assert.equal(normalizePath("https://example.com"), "/");
});

test("normalizePath: 퍼센트 디코딩(한글 허용, 구분자는 보존, 깨진 인코딩은 그대로)", () => {
  assert.equal(normalizePath("/%ED%95%9C%EA%B8%80"), "/한글");
  assert.equal(normalizePath("/a%2Fb/c"), "/a%2Fb/c");
  assert.equal(normalizePath("/bad%E0%A4%A"), "/bad%E0%A4%A");
});

test("normalizePath: 길이 상한", () => {
  assert.equal(normalizePath(`/${"a".repeat(5000)}`).length, 2048);
});

test("normalizeHost", () => {
  assert.equal(normalizeHost("Example.COM:443"), "example.com");
  assert.equal(normalizeHost("example.com."), "example.com");
  assert.equal(normalizeHost("[2001:db8::1]:8443"), "[2001:db8::1]:8443");
});

test("kindOfPath", () => {
  assert.equal(kindOfPath("/robots.txt"), "robots");
  assert.equal(kindOfPath("/llms.txt"), "llms");
  assert.equal(kindOfPath("/llms-full.txt"), "llms");
  assert.equal(kindOfPath("/sitemap.xml"), "sitemap");
  assert.equal(kindOfPath("/blog/sitemap-posts.xml"), "sitemap");
  assert.equal(kindOfPath("/pricing"), "page");
  assert.equal(kindOfPath("/index.html"), "page");
  assert.equal(kindOfPath("/a.php"), "page");
  assert.equal(kindOfPath("/_next/static/app.js"), "asset");
  assert.equal(kindOfPath("/img/logo.PNG"), "asset");
  assert.equal(kindOfPath("/feed.json"), "other");
  assert.equal(kindOfPath("/v1.2/docs"), "page"); // 마지막 구간에 점이 없으면 페이지
});

test("maskIdSegments: 식별자만 가린다", () => {
  assert.equal(maskIdSegments("/user/12345/orders"), "/user/:id/orders");
  assert.equal(maskIdSegments("/blog/2026/11"), "/blog/2026/11");
  assert.equal(maskIdSegments("/p/3f2504e0-4f89-11d3-9a0c-0305e82c3301"), "/p/:id");
  assert.equal(maskIdSegments("/t/a1b2c3d4e5f6a7b8"), "/t/:id");
  assert.equal(maskIdSegments("/about"), "/about");
});

test("parseClfTime: 오프셋을 UTC로 환산한다", () => {
  const T = Date.UTC(2026, 10, 5, 0, 12, 44);
  assert.deepEqual(parseClfTime("05/Nov/2026:09:12:44 +0900"), { ok: true, ms: T });
  assert.deepEqual(parseClfTime("05/Nov/2026:00:12:44 +0000"), { ok: true, ms: T });
  assert.deepEqual(parseClfTime("04/Nov/2026:19:12:44 -0500"), { ok: true, ms: T });
  assert.deepEqual(parseClfTime("05/Foo/2026:09:12:44 +0900"), { ok: false, reason: "bad-time" });
  assert.deepEqual(parseClfTime("05/Nov/2026:25:12:44 +0900"), { ok: false, reason: "bad-time" });
  assert.deepEqual(parseClfTime("어제"), { ok: false, reason: "bad-time" });
});

test("parseClfTime: 오프셋이 없으면 추측하지 않고 시간대를 요구한다", () => {
  assert.deepEqual(parseClfTime("05/Nov/2026:09:12:44"), { ok: false, reason: "time-needs-timezone" });
  // 사용자가 알려 준 오프셋(+540분 = KST)이 있을 때만 해석
  assert.deepEqual(parseClfTime("05/Nov/2026:09:12:44", 540), { ok: true, ms: Date.UTC(2026, 10, 5, 0, 12, 44) });
  // 로그가 오프셋을 직접 적었다면 가정보다 로그가 우선
  assert.deepEqual(parseClfTime("05/Nov/2026:09:12:44 +0000", 540), { ok: true, ms: Date.UTC(2026, 10, 5, 9, 12, 44) });
});

test("parseFlexibleTime: 숫자는 자릿수로 단위를 구분한다", () => {
  const want = 1_762_300_364_000;
  assert.deepEqual(parseFlexibleTime(1_762_300_364), { ok: true, ms: want }); // 초
  assert.deepEqual(parseFlexibleTime(1_762_300_364_000), { ok: true, ms: want }); // 밀리초
  assert.deepEqual(parseFlexibleTime("1762300364000000"), { ok: true, ms: want }); // 마이크로초
  assert.deepEqual(parseFlexibleTime("1762300364000000000"), { ok: true, ms: want }); // 나노초
  assert.deepEqual(parseFlexibleTime(0), { ok: false, reason: "bad-time" });
});

test("parseFlexibleTime: 시간대 없는 시각은 추측하지 않는다", () => {
  assert.deepEqual(parseFlexibleTime("2026-11-05T00:12:44Z"), { ok: true, ms: Date.UTC(2026, 10, 5, 0, 12, 44) });
  assert.deepEqual(parseFlexibleTime("2026-11-05T09:12:44+09:00"), { ok: true, ms: Date.UTC(2026, 10, 5, 0, 12, 44) });
  assert.deepEqual(parseFlexibleTime("2026-11-05 09:12:44", undefined), { ok: false, reason: "time-needs-timezone" });
  // 가정한 오프셋(+540분 = KST)이 있으면 그 기준으로 해석
  assert.deepEqual(parseFlexibleTime("2026-11-05 09:12:44", 540), { ok: true, ms: Date.UTC(2026, 10, 5, 0, 12, 44) });
  assert.deepEqual(parseFlexibleTime("2026-11-05T00:12:44.123456Z"), { ok: true, ms: Date.UTC(2026, 10, 5, 0, 12, 44, 123) });
  assert.deepEqual(parseFlexibleTime("어제"), { ok: false, reason: "bad-time" });
});
