#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
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

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
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
    if (url.hostname.endsWith("naver.com")) return false;
    if (url.hostname.endsWith("pstatic.net")) return false;
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

async function pickAnswerText(page, query) {
  return page.evaluate((queryText) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    const findAiRoot = () => {
      const explicit = document.querySelector(".fds-aib-expandable-container");
      if (explicit) return explicit;

      return null;
    };

    const root = findAiRoot();
    if (!root) return "";

    const markdownText = Array.from(root.querySelectorAll("[class*='fds-markdown']"))
      .filter((node) => !node.querySelector("[class*='fds-markdown']"))
      .map((node) => normalize(node.innerText || ""))
      .filter((text) => text.length >= 10 && !text.includes("새 창 열림"))
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
  const links = await page.evaluate(() =>
    {
      const explicit = document.querySelector(".fds-aib-expandable-container");
      if (!explicit) return [];

      return Array.from(explicit.querySelectorAll("a[href]")).map((anchor) => ({
      href: anchor.href,
      text: (anchor.innerText || anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
      title: anchor.getAttribute("title") || "",
      }));
    }
  );

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
  const promptId = argValue("prompt-id", DEFAULT_PROMPT_ID);
  const marketId = argValue("market-id", DEFAULT_MARKET_ID);
  const outputDir = argValue("out", ".tmp/naver-ai");
  const headed = hasFlag("headed");
  const timeoutMs = Number(argValue("timeout-ms", "45000"));
  const runAt = new Date().toISOString();

  const searchUrl = new URL("https://search.naver.com/search.naver");
  searchUrl.searchParams.set("ssc", "tab.ait.all");
  searchUrl.searchParams.set("ait_pv", "answer");
  searchUrl.searchParams.set("query", query);

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({
    locale: "ko-KR",
    viewport: { width: 1365, height: 960 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });

  let status = "success";
  let errorMessage = null;

  try {
    await page.goto(searchUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.getByText("자세히 더보기").first().click({ timeout: 5_000 }).catch(() => {});
    await waitForStableText(page, timeoutMs);

    const rawResponse = normalizeWhitespace(await pickAnswerText(page, query));
    const citations = await collectCitations(page);
    const screenshotPath = path.join(outputDir, `naver-ai-${Date.now()}.png`);
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
          queryUrl: searchUrl.toString(),
          finalUrl: page.url(),
          answerTextLength: rawResponse.length,
          screenshotPath,
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
              queryUrl: searchUrl.toString(),
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
    await browser.close();
  }
}

main();
