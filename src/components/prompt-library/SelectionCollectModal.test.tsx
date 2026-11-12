import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectionCollectModal } from "./SelectionCollectModal";
import { SerpApiCostConfirmModal } from "./SerpApiCostConfirmModal";

const rows = [
  { prompt: "A", promptId: "pa", surfaces: ["google-aio", "google-ai-mode", "naver-aio", "naver-ai"] as const },
  { prompt: "B", promptId: "pb", surfaces: ["google-aio"] as const },
].map((row) => ({ ...row, surfaces: [...row.surfaces] }));

test("selection collection shows bulk and per-surface SERP API switches only for supported surfaces", () => {
  const html = renderToStaticMarkup(
    <SelectionCollectModal open rows={rows} aioDeviceCount={2} onClose={() => {}} onReview={() => {}} />,
  );
  for (const label of ["SERP API 일괄 사용", "구글AIO SERP API 사용", "구글AI SERP API 사용", "네이버AIO SERP API 사용"]) {
    assert.ok(html.includes(`aria-label="${label}"`), label);
  }
  assert.ok(!html.includes('aria-label="네이버AI SERP API 사용"'));
  assert.ok(!html.includes('aria-label="Gemini SERP API 사용"'));
});

test("confirmation shows estimated total SERP API cost in USD", () => {
  const html = renderToStaticMarkup(
    <SerpApiCostConfirmModal
      rows={rows}
      enabled={new Set(["google-aio", "google-ai-mode", "naver-aio", "naver-ai"])}
      serpApiEnabled={new Set(["google-aio", "naver-aio"])}
      aioDeviceCount={2}
      onBack={() => {}}
      onConfirm={() => {}}
    />,
  );
  assert.ok(html.includes("SERP API 예상 총액"));
  assert.ok(html.includes("총 5회 조회"));
  assert.ok(html.includes("$0.0054"));
  assert.ok(html.includes("확인 후 수집 시작"));
});
