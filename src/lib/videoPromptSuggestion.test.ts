import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVideoPromptRequest, parseVideoPromptSuggestions } from "./videoPromptSuggestion";

const videos = [
  { videoId: "aaaaaaaaaaa", title: "세일즈포스 Slack 연동 방법", description: "설정 순서를 설명합니다" },
  { videoId: "bbbbbbbbbbb", title: "CRM 도입 체크리스트" },
];

test("the request lists every video, the already-registered prompts, and asks for JSON only", () => {
  const text = buildVideoPromptRequest({ brandName: "Salesforce", industry: "SaaS", videos, perVideo: 3, existingPrompts: ["CRM 추천"] });
  assert.match(text, /videoId: aaaaaaaaaaa/);
  assert.match(text, /설명: 설정 순서를 설명합니다/);
  assert.match(text, /videoId: bbbbbbbbbbb/);
  assert.match(text, /- CRM 추천/);
  assert.match(text, /3개씩/);
  assert.match(text, /JSON만 답하세요/);
});

test("parse keeps valid prompts per video and drops unknown videos, duplicates, overlong lines and overflow", () => {
  const raw = `설명입니다\n\`\`\`json\n${JSON.stringify({
    videos: [
      { videoId: "aaaaaaaaaaa", prompts: ["Slack 연동 방법", "slack  연동 방법", { text: "세일즈포스 Slack 알림 설정은?" }, "기존 프롬프트", "x".repeat(201), "넷째", "다섯째"] },
      { videoId: "zzzzzzzzzzz", prompts: ["모르는 영상"] },
      { videoId: "bbbbbbbbbbb", prompts: [] },
    ],
  })}\n\`\`\``;
  const parsed = parseVideoPromptSuggestions(raw, { videos, perVideo: 3, existingPrompts: ["기존 프롬프트"] });
  assert.ok(!("error" in parsed));
  assert.deepEqual(parsed.byVideo.aaaaaaaaaaa, ["Slack 연동 방법", "세일즈포스 Slack 알림 설정은?", "넷째"]);
  assert.equal(parsed.byVideo.zzzzzzzzzzz, undefined);
  // 중복·기존·긴 문장·넘침 4개 + 모르는 영상 1개
  assert.equal(parsed.droppedCount, 5);
});

test("parse reports unusable answers", () => {
  assert.ok("error" in parseVideoPromptSuggestions("그냥 문장", { videos, perVideo: 3 }));
  assert.ok("error" in parseVideoPromptSuggestions('{"items":[]}', { videos, perVideo: 3 }));
  assert.ok("error" in parseVideoPromptSuggestions('{"videos":[{"videoId":"aaaaaaaaaaa","prompts":[]}]}', { videos, perVideo: 3 }));
});

test("예상 프롬프트는 마침표·괄호 없는 검색어 형태로 정리하고 요청에 규칙을 넣는다", () => {
  assert.match(buildVideoPromptRequest({ brandName: "B", videos, perVideo: 2 }), /마침표\(\.\)와 괄호/);
  const parsed = parseVideoPromptSuggestions(JSON.stringify({ videos: [{ videoId: "aaaaaaaaaaa", prompts: ["CRM 연동 방법(슬랙 기준)."] }] }), { videos, perVideo: 2 });
  assert.ok("byVideo" in parsed);
  assert.deepEqual(parsed.byVideo.aaaaaaaaaaa, ["CRM 연동 방법"]);
});
