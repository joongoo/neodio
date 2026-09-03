#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_QUERY = "B2B 통합 마케팅 솔루션 추천";
const DEFAULT_MARKET_ID = "market-kr";
const DEFAULT_PROMPT_ID = "manual-naver-ai-test";
const NAVER_AI_MODEL_ID = "model-naver-ai-search";

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

function buildNaverQueryValue(query) {
  return query.trim().replace(/\s+/g, "+");
}

function buildNaverAiAnswerUrl(query) {
  return `https://search.naver.com/search.naver?ssc=tab.ait.all&query=${buildNaverQueryValue(query)}&ait_pv=answer`;
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

function decodeNaverRedirect(href) {
  try {
    const url = new URL(href);
    const encoded = url.searchParams.get("u") || url.searchParams.get("url");
    return encoded ? decodeURIComponent(encoded) : href;
  } catch {
    return href;
  }
}

function isUsefulExternalUrl(href) {
  try {
    const url = new URL(href);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.hostname.endsWith("pstatic.net")) return false;
    if (url.hostname === "search.naver.com") return false;
    return true;
  } catch {
    return false;
  }
}

async function waitForStableText(page, timeoutMs) {
  const start = Date.now();
  let previous = "";
  let stableCount = 0;

  while (Date.now() - start < timeoutMs) {
    const current = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
    const normalized = normalizeWhitespace(current);

    if (normalized.length > 300 && Math.abs(normalized.length - previous.length) < 20) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
    }

    previous = normalized;
    await page.waitForTimeout(1_000);
  }
}

async function waitForAiAnswer(page, timeoutMs, minWaitMs) {
  const start = Date.now();
  let previous = "";
  let stableCount = 0;

  await page.waitForTimeout(minWaitMs);

  while (Date.now() - start < timeoutMs) {
    const state = await page
      .evaluate(() => {
        const normalize = (value) => value.replace(/\s+/g, " ").trim();
        const root = document.querySelector(".fds-aib-expandable-container") || document.querySelector(".conversation-column");
        if (!root) {
          return { hasRoot: false, text: "" };
        }

        const text = Array.from(
          root.querySelectorAll(".fds-markdown-p, .fds-markdown-h, .fds-markdown-li-text, .fds-markdown-tr")
        )
          .map((node) => normalize(node.innerText || node.textContent || ""))
          .filter((value) => value.length >= 10)
          .join(" ");

        return { hasRoot: true, text };
      })
      .catch(() => ({ hasRoot: false, text: "" }));

    if (state.hasRoot && state.text.length >= 180 && Math.abs(state.text.length - previous.length) < 20) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
    }

    previous = state.text;
    await page.waitForTimeout(1_000);
  }
}

async function pickAnswerText(page, query) {
  return page.evaluate((queryText) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    const findAiRoot = () => {
      const explicit = document.querySelector(".fds-aib-expandable-container");
      if (explicit) return explicit;

      const conversation = document.querySelector(".conversation-column");
      if (conversation) return conversation;

      return null;
    };

    const root = findAiRoot();
    if (!root) return "";

    const readableText = (node) => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll(".fds-overlay-chip, button, svg, [aria-hidden='true']").forEach((child) => child.remove());

      if (clone.getAttribute("role") === "row") {
        const cells = Array.from(clone.querySelectorAll("[role='columnheader'], [role='cell']"))
          .map((cell) => normalize(cell.innerText || cell.textContent || ""))
          .filter(Boolean);
        return cells.join(" | ");
      }

      return normalize(clone.innerText || clone.textContent || "");
    };

    const markdownText = Array.from(
      root.querySelectorAll(".fds-markdown-p, .fds-markdown-h, .fds-markdown-li-text, .fds-markdown-tr")
    )
      .filter((node) => !node.closest(".fds-source-overlay-item"))
      .filter((node) => !node.parentElement?.closest(".fds-markdown-tr"))
      .map(readableText)
      .filter((text) => {
        if (text.length < 10) return false;
        if (text.includes("새 창 열림")) return false;
        if (text.includes("도움이 됐어요")) return false;
        if (text.includes("도움되지 않았어요")) return false;
        if (text.includes("신고하기")) return false;
        if (/^출처\s*\d+건/.test(text)) return false;
        return true;
      })
      .filter((text, index, list) => list.indexOf(text) === index)
      .join("\n\n");

    if (markdownText.length >= 180) return markdownText;

    const queryTerms = queryText
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);

    const candidates = Array.from(root.querySelectorAll("section, article, main, div"))
      .map((node) => {
        const text = normalize(node.innerText || "");
        const rect = node.getBoundingClientRect();
        const termHits = queryTerms.filter((term) => text.includes(term)).length;
        return {
          text,
          score: text.length + termHits * 250 - Math.abs(rect.top) * 0.2,
        };
      })
      .filter((item) => item.text.length >= 180 && item.text.length <= 8000)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.text || "";
  }, query);
}

async function collectCitations(page) {
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll(
      "a.fds-source-overlay-item[href], [aria-label='출처 정보'] a[href], .fds-aib-expandable-container a.fds-source-overlay-item[href]"
    );

    return Array.from(anchors).map((anchor) => ({
      href: anchor.getAttribute("data-nlog-imp-url") || anchor.href,
      text: (anchor.innerText || anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
      title:
        anchor.querySelector(".fds-source-overlay-item-title")?.textContent?.replace(/\s+/g, " ").trim() ||
        anchor.getAttribute("title") ||
        "",
    }));
  });

  const seen = new Set();
  const citations = [];

  for (const link of links) {
    const url = decodeNaverRedirect(link.href);
    if (!isUsefulExternalUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const hostname = new URL(url).hostname;
    citations.push({
      title: link.title || link.text || hostname,
      url,
      domain: hostname,
      isOwnDomain: hostname === "neodigm.com" || hostname.endsWith(".neodigm.com"),
    });
  }

  return citations.slice(0, 20);
}

async function main() {
  const query = argValue("query", DEFAULT_QUERY);
  const urlArg = argValue("url");
  const htmlFile = argValue("html-file");
  const promptId = argValue("prompt-id", DEFAULT_PROMPT_ID);
  const marketId = argValue("market-id", DEFAULT_MARKET_ID);
  const outputDir = argValue("out", ".tmp/naver-ai");
  const headed = hasFlag("headed");
  const timeoutMs = Number(argValue("timeout-ms", "45000"));
  const minWaitMs = Number(argValue("min-wait-ms", "18000"));
  const userDataDir = argValue("user-data-dir");
  const browserChannel = argValue("browser-channel");
  const incognito = hasFlag("incognito") || !userDataDir;
  const clickToStart = hasFlag("click-to-start");
  const cdpEndpoint = argValue("cdp-endpoint");
  const runAt = new Date().toISOString();

  const searchUrl = urlArg || buildNaverAiAnswerUrl(query);

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
    : !incognito && userDataDir
      ? await chromium.launchPersistentContext(userDataDir, {
          ...browserOptions,
          ...contextOptions,
        })
      : await (async () => {
          const launchedBrowser = await chromium.launch(browserOptions);
          const browserContext = await launchedBrowser.newContext(contextOptions);
          browserContext.once("close", () => launchedBrowser.close().catch(() => {}));
          return browserContext;
        })();
  const page = cdpEndpoint
    ? context.pages().find((candidate) => candidate.url().includes("search.naver.com/search.naver")) ||
      (await context.newPage())
    : await context.newPage();

  let status = "success";
  let errorMessage = null;

  try {
    if (htmlFile) {
      await page.setContent(await readFile(htmlFile, "utf8"));
    } else {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      if (clickToStart) {
        await page.mouse.click(680, 520);
        await page.waitForTimeout(1_000);
      }
      await waitForAiAnswer(page, timeoutMs, minWaitMs);
      await page.getByText("자세히 더보기").first().click({ timeout: 5_000 }).catch(() => {});
      await waitForAiAnswer(page, Math.min(timeoutMs, 20_000), 0);
      await page.getByText(/출처 \d+건 전체보기/).first().click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
    if (htmlFile) {
      await waitForStableText(page, timeoutMs);
    }

    const rawResponse = normalizeMultiline(await pickAnswerText(page, query));
    const citations = await collectCitations(page);
    const artifactId = Date.now();
    const screenshotPath = path.join(outputDir, `naver-ai-${artifactId}.png`);
    const htmlPath = path.join(outputDir, `naver-ai-${artifactId}.html`);
    await writeFile(htmlPath, await page.content(), "utf8");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (rawResponse.length < 180) {
      status = "failed";
      errorMessage = "empty_ai_briefing: Naver did not render an AI briefing for this query, or the AI briefing DOM changed.";
    }

    const result = {
      promptRun: {
        id: `run-naver-ai-${Date.now()}`,
        promptId,
        llmModelId: NAVER_AI_MODEL_ID,
        marketId,
        runAt,
        status,
        rawResponse,
        rawMetadata: {
          source: "naver-ai-search",
          collectedBy: "playwright",
          query,
          queryUrl: searchUrl,
          finalUrl: page.url(),
          htmlFile,
          userDataDir: incognito ? undefined : userDataDir,
          browserChannel,
          incognito,
          clickToStart,
          cdpEndpoint,
          answerTextLength: rawResponse.length,
          screenshotPath,
          htmlPath,
          citations,
          errorMessage,
        },
      },
    };

    const outputPath = path.join(outputDir, `naver-ai-${runAt.replaceAll(":", "-")}.json`);
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({ status, outputPath, answerTextLength: rawResponse.length, citations: citations.length }, null, 2));
  } catch (error) {
    status = "failed";
    const outputPath = path.join(outputDir, `naver-ai-${runAt.replaceAll(":", "-")}.json`);
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          promptRun: {
            id: `run-naver-ai-${Date.now()}`,
            promptId,
            llmModelId: NAVER_AI_MODEL_ID,
            marketId,
            runAt,
            status,
            rawResponse: "",
            rawMetadata: {
              source: "naver-ai-search",
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
      await browser.close();
    } else {
      await context.close();
    }
  }
}

main();
