import assert from "node:assert/strict";
import test from "node:test";
import { needsSearchQueryCleanup, toSearchQueryText } from "./searchQueryText";

test("괄호와 안의 설명, 문장 끝 마침표를 뺀다", () => {
  assert.equal(toSearchQueryText("B2B 마케팅 대행사(ABM, 리드 제너레이션 등) 추천해줘."), "B2B 마케팅 대행사 추천해줘");
  assert.equal(toSearchQueryText("허브스팟 (HubSpot) 가격은 얼마인가요?"), "허브스팟 가격은 얼마인가요?");
  assert.equal(toSearchQueryText("중첩 (바깥 (안쪽) 설명) 테스트."), "중첩 테스트");
  assert.equal(toSearchQueryText("짝이 안 맞는 (괄호 추천"), "짝이 안 맞는 괄호 추천");
  assert.equal(toSearchQueryText("마케팅 자동화 도구 비교..."), "마케팅 자동화 도구 비교");
});

test("이름 안의 점은 남긴다", () => {
  assert.equal(toSearchQueryText("Next.js 와 React 비교."), "Next.js 와 React 비교");
  assert.equal(toSearchQueryText("kakao.com 광고 방법"), "kakao.com 광고 방법");
  assert.equal(toSearchQueryText("GPT 4.5 가격"), "GPT 4.5 가격");
});

test("정리할 게 없으면 그대로이고, 전부 지워지면 원문을 쓴다", () => {
  assert.equal(toSearchQueryText("강남 맛집 추천해줘"), "강남 맛집 추천해줘");
  assert.equal(needsSearchQueryCleanup("강남 맛집 추천해줘"), false);
  assert.equal(needsSearchQueryCleanup("강남 맛집 추천해줘."), true);
  assert.equal(toSearchQueryText("(설명)"), "(설명)");
});
