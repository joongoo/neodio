#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_QUERY = "B2B 마케팅 솔루션 추천";
const DEFAULT_MARKET_ID = "market-kr";
const DEFAULT_PROMPT_ID = "manual-google-ai-test";
const GOOGLE_AI_MODEL_ID = "model-google-ai-overview";

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function buildGoogleQueryValue(query) {
  return encodeURIComponent(query.trim());
}

function buildGoogleSearchUrl(query) {
  return `https://www.google.com/search?q=${buildGoogleQueryValue(query)}&hl=ko`;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value) {
  return value
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join("\n\n");
}

function isUsefulExternalUrl(href) {
  try {
    const url = new URL(href);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.hostname.endsWith("google.com")) return false;
    if (url.hostname.endsWith("gstatic.com")) return false;
    return true;
  } catch {
    return false;
  }
}

async function waitForAiOverview(page, timeoutMs, minWaitMs) {
  const start = Date.now();
  let previous = "";
  let stableCount = 0;

  await page.waitForTimeout(minWaitMs);

  while (Date.now() - start < timeoutMs) {
    const length = await page
      .evaluate(() => {
        const blocks = Array.from(document.querySelectorAll("div"))
          .filter((node) => node.childElementCount > 0 && node.childElementCount < 60)
          .map((node) => (node.innerText || "").trim())
          .filter((text) => text.length > 300);
        blocks.sort((a, b) => a.length - b.length);
        return blocks[0]?.length || 0;
      })
      .catch(() => 0);

    if (length > 300 && Math.abs(length - previous) < 20) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
    }

    previous = length;
    await page.waitForTimeout(1_000);
  }
}

async function pickAnswerText(page, query) {
  return page.evaluate((queryText) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();

    const queryTerms = queryText
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);

    const candidates = Array.from(document.querySelectorAll("div"))
      .filter((node) => node.childElementCount > 0 && node.childElementCount < 80)
      .map((node) => {
        const text = normalize(node.innerText || "");
        const rect = node.getBoundingClientRect();
        const termHits = queryTerms.filter((term) => text.includes(term)).length;
        return {
          node,
          text,
          score: text.length + termHits * 250 - Math.abs(rect.top) * 0.2,
        };
      })
      .filter((item) => item.text.length >= 250 && item.text.length <= 8000)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.text || "";
  }, query);
}

async function collectCitations(page) {
  const links = await page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();

    const root = document.querySelector('[data-container-id="rhs-col"]') || document;
    const anchors = Array.from(root.querySelectorAll("a.vIWmYe[href]"));

    return anchors.map((anchor) => {
      const card = anchor.closest("div[data-src-id], div.cRH23c") || anchor.parentElement;
      const favicon = card?.querySelector('img[src*="faviconV2"], img[data-src*="faviconV2"]');
      const faviconUrl = favicon?.getAttribute("data-src") || favicon?.getAttribute("src") || "";
      const sourceName = normalize(card?.querySelector(".jdxGff")?.textContent || "");
      const titleText = normalize(card?.querySelector(".gpZmoc, .pNAzYe")?.textContent || "");
      const ariaLabel = normalize(anchor.getAttribute("aria-label") || "");

      return {
        href: anchor.href,
        faviconUrl,
        sourceName,
        title: titleText || ariaLabel,
      };
    });
  });

  const seen = new Set();
  const citations = [];

  for (const link of links) {
    let domain = link.sourceName;
    try {
      const faviconUrl = new URL(link.faviconUrl, "https://www.google.com");
      const targetUrl = faviconUrl.searchParams.get("url");
      if (targetUrl) domain = new URL(targetUrl).hostname;
    } catch {
      // keep sourceName as fallback domain label
    }

    const key = link.href;
    if (seen.has(key)) continue;
    seen.add(key);

    citations.push({
      title: link.title || domain,
      url: link.href,
      domain,
      isOwnDomain: domain === "neodigm.com" || domain?.endsWith?.(".neodigm.com"),
    });
  }

  return citations.slice(0, 20);
}

async function main() {
  const query = argValue("query", DEFAULT_QUERY);
  const urlArg = argValue("url");
  const promptId = argValue("prompt-id", DEFAULT_PROMPT_ID);
  const marketId = argValue("market-id", DEFAULT_MARKET_ID);
  const outputDir = argValue("out", ".tmp/google-ai");
  const headed = hasFlag("headed");
  const timeoutMs = Number(argValue("timeout-ms", "45000"));
  const minWaitMs = Number(argValue("min-wait-ms", "8000"));
  const browserChannel = argValue("browser-channel");
  const cdpEndpoint = argValue("cdp-endpoint");
  const runAt = new Date().toISOString();

  const searchUrl = urlArg || buildGoogleSearchUrl(query);

  await mkdir(outputDir, { recursive: true });

  const browserOptions = {
    headless: !headed,
    ...(browserChannel ? { channel: browserChannel } : {}),
  };
  const contextOptions = {
    locale: "ko-KR",
    viewport: { width: 1365, height: 960 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };

  const browser = cdpEndpoint ? await chromium.connectOverCDP(cdpEndpoint) : null;
  const context = cdpEndpoint
    ? browser.contexts()[0] || (await browser.newContext(contextOptions))
    : await (async () => {
        const launchedBrowser = await chromium.launch(browserOptions);
        const browserContext = await launchedBrowser.newContext(contextOptions);
        browserContext.once("close", () => launchedBrowser.close().catch(() => {}));
        return browserContext;
      })();
  const page = cdpEndpoint
    ? context.pages().find((candidate) => candidate.url().includes("google.com/search")) || (await context.newPage())
    : await context.newPage();

  let status = "success";
  let errorMessage = null;

  try {
    const alreadyOnResultsPage = cdpEndpoint && page.url().includes("google.com/search");
    if (!alreadyOnResultsPage) {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    }
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await waitForAiOverview(page, timeoutMs, minWaitMs);
    await page.getByRole("button", { name: /AI 개요 더보기/ }).first().click({ timeout: 5_000 }).catch(() => {});
    await waitForAiOverview(page, Math.min(timeoutMs, 15_000), 0);

    const rawResponse = normalizeMultiline(await pickAnswerText(page, query));
    const citations = await collectCitations(page);
    const artifactId = Date.now();
    const screenshotPath = path.join(outputDir, `google-ai-${artifactId}.png`);
    const htmlPath = path.join(outputDir, `google-ai-${artifactId}.html`);
    await writeFile(htmlPath, await page.content(), "utf8");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (rawResponse.length < 250) {
      status = "failed";
      errorMessage = "empty_ai_overview: Google did not render an AI overview for this query, or the AI overview DOM changed.";
    }

    const result = {
      promptRun: {
        id: `run-google-ai-${Date.now()}`,
        promptId,
        llmModelId: GOOGLE_AI_MODEL_ID,
        marketId,
        runAt,
        status,
        rawResponse,
        rawMetadata: {
          source: "google-ai-overview",
          collectedBy: "playwright",
          query,
          queryUrl: searchUrl,
          finalUrl: page.url(),
          browserChannel,
          cdpEndpoint,
          answerTextLength: rawResponse.length,
          screenshotPath,
          htmlPath,
          citations,
          errorMessage,
        },
      },
    };

    const outputPath = path.join(outputDir, `google-ai-${runAt.replaceAll(":", "-")}.json`);
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({ status, outputPath, answerTextLength: rawResponse.length, citations: citations.length }, null, 2));
  } catch (error) {
    status = "failed";
    const outputPath = path.join(outputDir, `google-ai-${runAt.replaceAll(":", "-")}.json`);
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          promptRun: {
            id: `run-google-ai-${Date.now()}`,
            promptId,
            llmModelId: GOOGLE_AI_MODEL_ID,
            marketId,
            runAt,
            status,
            rawResponse: "",
            rawMetadata: {
              source: "google-ai-overview",
              collectedBy: "playwright",
              query,
              queryUrl: searchUrl,
              finalUrl: page.url(),
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.error(JSON.stringify({ status, outputPath, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    } else {
      await context.close();
    }
  }
}

main();
