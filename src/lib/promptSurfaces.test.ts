import assert from "node:assert/strict";
import test from "node:test";
import { AIO_DAILY_CAP, aioDailyLoad, isPromptSurface, normalizeSurfaces, suggestSurfaces } from "./promptSurfaces";

test("surfaces are validated, de-duplicated and kept in a fixed order", () => {
  assert.equal(isPromptSurface("google-aio"), true);
  assert.equal(isPromptSurface("bing"), false);
  assert.deepEqual(normalizeSurfaces(["naver-ai", "bing", "google-aio", "naver-ai", 3]), ["google-aio", "naver-ai"]);
  assert.deepEqual(normalizeSurfaces("google-aio"), []);
  assert.deepEqual(normalizeSurfaces(undefined), []);
});

test("short search-style queries default to AIO, full questions to the AI answer surfaces", () => {
  assert.deepEqual(suggestSurfaces("마케토 도입 비용"), ["google-aio"]);
  assert.deepEqual(suggestSurfaces("국내 GEO 컨설팅 업체 추천"), ["google-aio"]);
  assert.deepEqual(suggestSurfaces("2025 Neodigm Year End Party"), ["google-aio"]);
  assert.deepEqual(suggestSurfaces("마케토 도입하려면 비용이 얼마나 드나요?"), ["naver-ai", "google-ai-mode"]);
  assert.deepEqual(suggestSurfaces("B2B 기업이 마케팅 자동화를 도입할 때 무엇을 비교해야 해"), ["naver-ai", "google-ai-mode"]);
  assert.deepEqual(suggestSurfaces("마케토 구축 파트너 어디가 좋아요"), ["naver-ai", "google-ai-mode"]);
});

test("the suggestion is a fresh array each time", () => {
  const a = suggestSurfaces("이걸 알려줄 수 있나요?");
  a.push("google-aio");
  assert.deepEqual(suggestSurfaces("이걸 알려줄 수 있나요?"), ["naver-ai", "google-ai-mode"]);
});

test("the daily AIO load counts prompts with the AIO surface times devices and warns above the cap", () => {
  const lists = [["google-aio"], ["naver-ai"], undefined, ["google-aio", "naver-ai"]] as const;
  assert.deepEqual(aioDailyLoad(lists.map((l) => (l ? [...l] : undefined)), 2), { prompts: 2, searches: 4, cap: AIO_DAILY_CAP, over: false });
  const many = Array.from({ length: 101 }, () => ["google-aio" as const]);
  assert.equal(aioDailyLoad(many, 2).over, true);
  assert.equal(aioDailyLoad(many, 0).searches, 101, "at least one device is assumed");
});
