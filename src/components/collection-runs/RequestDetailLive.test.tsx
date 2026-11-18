import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestProgressStages } from "./RequestDetailLive";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";

test("progress shows independent stages including partial results and uncertain submissions", () => {
  const request = { counts: { total: 20, waiting: 2, running: 6, completed: 8, failed: 2, attention: 1, cancelled: 1 },
    phases: { submitting: 1, collecting: 3, processing: 2 } } as RequestLogRow;
  const html = renderToStaticMarkup(<RequestProgressStages request={request} />);
  for (const label of ["수집 대기", "제출 중", "수집·회수 중", "결과 반영 중", "완료", "실패", "제출 확인 필요", "취소"]) assert.ok(html.includes(label), label);
  assert.match(html, /수집·회수 중<\/dt><dd[^>]*>3<\/dd>/);
  assert.ok(html.includes("전체 완료를 기다리지 않고"));
});
