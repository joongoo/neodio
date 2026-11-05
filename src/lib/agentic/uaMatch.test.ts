import test from "node:test";
import assert from "node:assert/strict";
import { BOT_ENTRIES } from "./registry";
import { UA } from "./testing";
import { hasToken, looksLikeBot, matchBot, normalizeUaForInbox } from "./uaMatch";

test("단어 경계: 앞뒤에 영숫자·하이픈·밑줄이 붙으면 일치하지 않는다", () => {
  assert.equal(hasToken("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)", "OAI-SearchBot"), true);
  assert.equal(hasToken("xOAI-SearchBotz", "OAI-SearchBot"), false);
  assert.equal(hasToken("xOAI-SearchBot", "OAI-SearchBot"), false);
  assert.equal(hasToken("OAI-SearchBotz", "OAI-SearchBot"), false);
  assert.equal(hasToken("OAI-SearchBot_v2", "OAI-SearchBot"), false);
  assert.equal(hasToken("Googlebot-Image/1.0", "Googlebot"), false); // 하이픈 변형은 다른 크롤러
  assert.equal(hasToken("Googlebot/2.1", "Googlebot"), true);
  assert.equal(hasToken("(Googlebot)", "Googlebot"), true);
  assert.equal(hasToken("Googlebot", "Googlebot"), true);
});

test("대소문자 무시, 여러 번 나와도 경계가 맞는 것을 찾는다", () => {
  assert.equal(hasToken("gptbot/1.1", "GPTBot"), true);
  assert.equal(hasToken("xGPTBot then GPTBot/1.0", "GPTBot"), true);
  assert.equal(hasToken("xGPTBot then yGPTBot", "GPTBot"), false);
  assert.equal(hasToken("anything", ""), false);
});

test("Claude 세 봇은 서로 섞이지 않는다", () => {
  assert.equal(matchBot(UA.claudeBot, BOT_ENTRIES)?.id, "anthropic-claudebot");
  assert.equal(matchBot(UA.claudeUser, BOT_ENTRIES)?.id, "anthropic-user");
  assert.equal(matchBot(UA.claudeSearch, BOT_ENTRIES)?.id, "anthropic-searchbot");
});

test("OpenAI 봇 구분", () => {
  assert.equal(matchBot(UA.gptbot, BOT_ENTRIES)?.id, "openai-gptbot");
  assert.equal(matchBot(UA.chatgptUser, BOT_ENTRIES)?.id, "openai-chatgpt-user");
  assert.equal(matchBot(UA.oaiSearch, BOT_ENTRIES)?.id, "openai-searchbot");
});

test("한 UA에 토큰이 둘이면 더 긴(구체적인) 토큰이 이긴다", () => {
  const entries = [
    { ...BOT_ENTRIES[0], id: "short", uaToken: "Foo" },
    { ...BOT_ENTRIES[0], id: "long", uaToken: "Foo-Search" },
  ];
  assert.equal(matchBot("x Foo-Search/1 Foo/2", entries)?.id, "long");
  assert.equal(matchBot("x Foo/2", entries)?.id, "short");
});

test("일반 브라우저 UA는 봇으로 보지 않고, 봇 같은 UA는 후보로 본다", () => {
  assert.equal(matchBot(UA.chrome, BOT_ENTRIES), null);
  assert.equal(looksLikeBot(UA.chrome), false);
  assert.equal(looksLikeBot("SomeNewCrawler/2.0"), true);
  assert.equal(looksLikeBot("curl-fetcher/1.0"), true);
  assert.equal(looksLikeBot("Mozilla/5.0 (compatible; Mystery/1.0; +https://example.org/about)"), true);
  assert.equal(looksLikeBot(""), false);
});

test("수신함 정규화: 버전 숫자는 N으로, 공백 정리, 길이 상한", () => {
  assert.equal(normalizeUaForInbox("NewBot/2.4.1  (build 77)"), "NewBot/N (build N)");
  assert.equal(normalizeUaForInbox("a".repeat(500)).length, 200);
});
