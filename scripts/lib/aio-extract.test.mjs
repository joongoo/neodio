import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { extractAioInPage } from "./aio-extract.mjs";

test("extracts visible answer inside display:contents without hidden text or source panel", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <section><h2>AI Overview</h2>
        <div style="display:contents">
          <p>Annual CRM budget depends on active users.</p>
          <div style="display:none"><p>Hidden answer</p></div>
          <p>Include implementation costs.</p>
        </div>
        <aside><a href="https://www.google.com/url?q=https://example.com" aria-label="Budget guide. Opens in new tab">Source panel text</a></aside>
      </section>`);
    const result = await page.evaluate(extractAioInPage);
    assert.equal(result.state, "present");
    assert.equal(result.aioText, "Annual CRM budget depends on active users.\nInclude implementation costs.");
    assert.equal(result.sources.length, 1);
    assert.equal(result.paragraphs.length, 2);
  } finally {
    await browser.close();
  }
});
