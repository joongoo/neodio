import assert from "node:assert/strict";
import test from "node:test";
import { extractPageText, fetchPageText, isAllowedHost, PageFetchError } from "./pageText";

test("allowed hosts: registered domain and subdomains only, never IPs or localhost", () => {
  const allowed = ["www.neodigm.com", "example.co.kr"];
  assert.equal(isAllowedHost("www.neodigm.com", allowed), true);
  assert.equal(isAllowedHost("neodigm.com", allowed), true);
  assert.equal(isAllowedHost("blog.neodigm.com", allowed), true);
  assert.equal(isAllowedHost("evilneodigm.com", allowed), false);
  assert.equal(isAllowedHost("neodigm.com.evil.io", allowed), false);
  assert.equal(isAllowedHost("127.0.0.1", ["127.0.0.1"]), false);
  assert.equal(isAllowedHost("localhost", ["localhost"]), false);
});

test("extractPageText keeps title, description, headings and body; drops scripts and nav", () => {
  const html = `<html><head><title>가이드 &amp; 팁</title><meta name="description" content="설명 문구"><script>var x=1</script></head>
  <body><nav>메뉴</nav><h1>메인 제목</h1><p>첫 문단입니다.</p><h2>소제목</h2><p>둘째 문단.</p><footer>푸터</footer></body></html>`;
  const text = extractPageText(html);
  assert.match(text, /제목: 가이드 & 팁/);
  assert.match(text, /메타 설명: 설명 문구/);
  assert.match(text, /# 메인 제목\n## 소제목/);
  assert.match(text, /첫 문단입니다\./);
  assert.doesNotMatch(text, /var x|메뉴|푸터/);
  assert.ok(extractPageText("<p>" + "가".repeat(20000) + "</p>", 100).length < 130);
});

test("fetchPageText refuses unregistered hosts before any request", async () => {
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("");
  }) as typeof fetch;
  try {
    await assert.rejects(fetchPageText("https://evil.example.org/x", ["neodigm.com"]), PageFetchError);
    await assert.rejects(fetchPageText("http://169.254.169.254/latest", ["neodigm.com"]), PageFetchError);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchPageText re-checks redirects against the allowlist", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, { status: 302, headers: { location: "https://internal.evil.io/secret" } })) as typeof fetch;
  try {
    await assert.rejects(fetchPageText("https://neodigm.com/a", ["neodigm.com"]), PageFetchError);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchPageText returns an excerpt for an allowed page", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<html><title>T</title><body><h1>H</h1><p>내용</p></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as typeof fetch;
  try {
    const text = await fetchPageText("https://www.neodigm.com/a", ["neodigm.com"]);
    assert.match(text, /제목: T/);
    assert.match(text, /내용/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
