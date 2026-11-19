import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AioMarkdown } from "./AioMarkdown";

test("AIO markdown renders headings, emphasis, lists, links and tables", () => {
  const html = renderToStaticMarkup(<AioMarkdown text={'## AI 개요\n\n**핵심** 설명\n\n- 첫 항목\n- 둘째 항목\n\n[출처](https://example.com)\n\n| 항목 | 값 |\n| --- | --- |\n| 인용 | 1 |'} />);
  for (const fragment of ["<h2>AI 개요</h2>", "<strong>핵심</strong>", "<ul>", "<li>첫 항목</li>", 'href="https://example.com"', '<table', '<td>인용</td>']) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test("collected HTML and unsafe markdown URLs cannot execute", () => {
  const html = renderToStaticMarkup(<AioMarkdown text={'일반 본문\n\n<script>alert(1)</script>\n\n[링크](javascript:alert%281%29)'} />);
  assert.ok(html.includes("일반 본문"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("javascript:"));
});

test("citations stay inside the final paragraph or list item", () => {
  for (const text of ["첫 문단\n\n마지막 **문장**", "- 첫 항목\n- 마지막 **문장**", "1. 첫 항목\n2. 마지막 **문장**", "> 마지막 **문장**"]) {
    const html = renderToStaticMarkup(<AioMarkdown text={text} sources={[1, 2]} ownSources={[2]} />);
    assert.match(html, /<strong>문장<\/strong><sup[^>]*>/);
    assert.ok(html.includes('<span class="text-blue-600">[2]</span>'));
    assert.equal((html.match(/<sup/g) ?? []).length, 1);
    assert.match(html, /<\/sup><\/(p|li)>/);
  }
});
