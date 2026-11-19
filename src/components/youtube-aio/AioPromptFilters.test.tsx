import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AioPromptFilters } from "./AioPromptFilters";

test("filter options show counts, prioritize own channel, and disable only unselected empty options", () => {
  const html = renderToStaticMarkup(<AioPromptFilters query="youtube=own" facets={{ aio: { aio_present: 2 }, youtube: { own: 0, other: 0, none: 2 } }} onChange={() => {}} />);
  assert.ok(html.indexOf("우리 채널") < html.indexOf("타 채널"));
  assert.match(html, /role="checkbox" aria-checked="true" aria-disabled="false"/);
  assert.match(html, /role="checkbox" aria-checked="false" aria-disabled="true" disabled=""/);
  assert.ok(html.includes("cursor-not-allowed opacity-40"));
  assert.match(html, /tabular-nums text-neutral-500">2<\/span>/);
  assert.ok(!html.includes('type="date"'));
  assert.ok(html.includes('aria-label="필터 초기화"'));
  assert.ok(html.includes("lucide-rotate-ccw"));
  assert.ok(html.includes("ml-auto flex items-end gap-2"));
});
