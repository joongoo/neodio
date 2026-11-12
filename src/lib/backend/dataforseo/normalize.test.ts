import assert from "node:assert/strict";
import test from "node:test";
import type { DataForSeoApiResponse, DataForSeoSurface } from "./types";
import { normalizeDataForSeoResult } from "./normalize";

function context(surface: DataForSeoSurface) {
  return {
    observationId: "obs-1",
    providerTaskId: "task-internal-1",
    surface,
    query: "생성형 AI란",
    device: "desktop" as const,
    collectedAt: "2026-11-12T02:00:00.000Z",
    rawArtifactId: "artifact-1",
  };
}

function response(task: Record<string, unknown>): DataForSeoApiResponse {
  return { version: "0.1", status_code: 20000, status_message: "Ok", tasks: [{ id: "provider-1", status_code: 20000, status_message: "Ok", cost: 0.0012, ...task }] };
}

test("Google AIO 본문과 중복 제거한 출처를 정규화한다", () => {
  const result = normalizeDataForSeoResult(context("google-aio"), response({
    data: { se_type: "organic" },
    result: [{ item_types: ["ai_overview", "organic"], items: [{
      type: "ai_overview",
      markdown: "답변 [출처](https://example.com/a#part)",
      references: [
        { type: "ai_overview_reference", title: "Example", url: "https://example.com/a#part", domain: "example.com" },
        { type: "ai_overview_reference", title: "Other", url: "https://other.test/x", domain: "other.test" },
      ],
    }] }],
  }));
  assert.equal(result.outcome, "ai_answered");
  assert.equal(result.answerText, "답변 [출처](https://example.com/a#part)");
  assert.deepEqual(result.citations.map((item) => item.url), ["https://example.com/a", "https://other.test/x"]);
});

test("Google AI 항목이 없는 정상 결과는 ai_absent다", () => {
  const result = normalizeDataForSeoResult(context("google-ai-mode"), response({
    data: { se_type: "ai_mode" },
    result: [{ item_types: ["organic"], items: [{ type: "organic", title: "일반 결과" }] }],
  }));
  assert.equal(result.outcome, "ai_absent");
  assert.equal(result.answerText, null);
});

test("Naver 내장 JSON에서 브리핑 본문과 출처를 추출한다", () => {
  const payload = {
    refs: { blockId: "ai-briefing/prs_template_aib_answer_desk.ts" },
    body: { props: {
      summary: { markdown: "생성형 AI 답변입니다.<template data-fender-markdown-id=\"source-chip\"></template>" },
      sources: [
        { title: "첫 출처", url: "https://example.com/a#section" },
        { title: "중복", url: "https://example.com/a" },
        { sourceName: "둘째 출처", url: "https://other.test/b" },
      ],
      feedback: { aibType: "answertype" },
    } },
  };
  const html = `<h2>AI 브리핑</h2><script>entry.bootstrap(root, ${JSON.stringify(payload)}, {});</script>`;
  const result = normalizeDataForSeoResult(context("naver-aio"), response({ result: [{ items: [{ page: 1, html }] }] }));
  assert.equal(result.outcome, "ai_answered");
  assert.equal(result.answerText, "생성형 AI 답변입니다.");
  assert.deepEqual(result.citations.map((item) => [item.title, item.url]), [
    ["첫 출처", "https://example.com/a"],
    ["둘째 출처", "https://other.test/b"],
  ]);
});

test("Naver 브리핑 제목만 있으면 parse_error이고 일반 SERP면 ai_absent다", () => {
  const withTitle = normalizeDataForSeoResult(context("naver-aio"), response({ result: [{ items: [{ html: "<h2>AI 브리핑</h2>" }] }] }));
  const ordinary = normalizeDataForSeoResult(context("naver-aio"), response({ result: [{ items: [{ html: "<h2>검색 결과</h2>" }] }] }));
  assert.equal(withTitle.outcome, "parse_error");
  assert.equal(ordinary.outcome, "ai_absent");
});
