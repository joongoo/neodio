#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { BROWSER_CLOSED_EXIT_CODE, isBrowserClosedError } from "./lib/incognito-chrome.mjs";

const DEFAULT_QUERY = "B2B 통합 마케팅 솔루션 추천";
const DEFAULT_MARKET_ID = "market-kr";
const DEFAULT_PROMPT_ID = "manual-naver-ai-test";
const NAVER_AI_MODEL_ID = "model-naver-ai-search";
const NAVER_OVERVIEW_MODEL_ID = "model-naver-overview";

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

// 검색 결과 첫 화면(통합검색)에 뜨는 AI 브리핑 — AI 탭과 같은 fds-aib 화면 조각을 쓰지만 주소와 대기 방식이 다르다.
function buildNaverOverviewUrl(query) {
  return `https://search.naver.com/search.naver?query=${buildNaverQueryValue(query)}`;
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

function attachCloseLogging(page, context) {
  const t0 = Date.now();
  const log = (message) => console.error(`[keep-open +${((Date.now() - t0) / 1000).toFixed(1)}s] ${message}`);
  page.on("close", () => log("탭이 닫혔습니다"));
  page.on("crash", () => log("탭이 크래시했습니다"));
  page.on("popup", (popup) => log(`팝업 열림: ${popup.url()}`));
  context.on("close", () => log("브라우저 컨텍스트가 닫혔습니다"));
  context.browser()?.on("disconnected", () => log("브라우저 연결이 끊겼습니다(Chrome 종료)"));
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

// 통합검색은 AI 브리핑이 있으면 첫 화면에 바로 그려진다 — 없는 질의는 끝까지 안 나오므로 짧게 기다리고 없다고 본다.
async function waitForOverview(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page
      .evaluate(() => !!document.querySelector(".fds-aib-expandable-container .fds-markdown-p, .fds-aib-expandable-container .fds-markdown-h"))
      .catch(() => false);
    if (found) break;
    await page.waitForTimeout(1_000);
  }
  await waitForAiAnswer(page, timeoutMs, 0);
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

async function collectCitations(page, overview = false) {
  const links = await page.evaluate((isOverview) => {
    // 통합검색의 AI 브리핑은 출처가 일반 앵커(fds-anchor-layout)로 그려진다 — 브리핑 상자 안의 링크만 본다.
    const anchors = document.querySelectorAll(
      isOverview
        ? ".fds-aib-expandable-container a.fds-anchor-layout[href], .fds-aib-expandable-container a.fds-source-overlay-item[href]"
        : "a.fds-source-overlay-item[href], [aria-label='출처 정보'] a[href], .fds-aib-expandable-container a.fds-source-overlay-item[href]"
    );

    return Array.from(anchors).map((anchor) => ({
      href: anchor.getAttribute("data-nlog-imp-url") || anchor.href,
      text: (anchor.innerText || anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").replace(/\s*새 창 열림\s*$/, "").trim(),
      title: (
        anchor.querySelector(".fds-source-overlay-item-title")?.textContent?.replace(/\s+/g, " ").trim() ||
        anchor.getAttribute("title") ||
        ""
      ).replace(/\s*새 창 열림\s*$/, ""),
    }));
  }, overview);

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

const CAPTCHA_EXIT_CODE = 3;

async function isNaverCaptcha(page) {
  const url = page.url();
  if (/captcha|nidlogin|\/nid\/|abuse/i.test(url)) return true;
  const text = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return /자동입력 방지|보안 ?문자|비정상적인 (접근|검색|트래픽)|captcha/i.test(text.slice(0, 3000)) && text.length < 1500;
}

async function main() {
  const query = argValue("query", DEFAULT_QUERY);
  const urlArg = argValue("url");
  const htmlFile = argValue("html-file");
  const promptId = argValue("prompt-id", DEFAULT_PROMPT_ID);
  const marketId = argValue("market-id", DEFAULT_MARKET_ID);
  const overview = argValue("mode") === "overview";
  const outputDir = argValue("out", overview ? ".tmp/naver-overview" : ".tmp/naver-ai");
  const keepOpen = hasFlag("keep-open");
  const captchaWaitMs = Number(argValue("captcha-wait-ms", "0"));
  const headed = hasFlag("headed") || keepOpen;
  const timeoutMs = Number(argValue("timeout-ms", "45000"));
  const minWaitMs = Number(argValue("min-wait-ms", "18000"));
  const userDataDir = argValue("user-data-dir");
  const browserChannel = argValue("browser-channel");
  const incognito = hasFlag("incognito") || !userDataDir;
  const clickToStart = hasFlag("click-to-start");
  const cdpEndpoint = argValue("cdp-endpoint");
  const runAt = new Date().toISOString();

  const searchUrl = urlArg || (overview ? buildNaverOverviewUrl(query) : buildNaverAiAnswerUrl(query));
  const filePrefix = overview ? "naver-overview" : "naver-ai";
  const modelId = overview ? NAVER_OVERVIEW_MODEL_ID : NAVER_AI_MODEL_ID;
  const sourceName = overview ? "naver-overview" : "naver-ai-search";

  await mkdir(outputDir, { recursive: true });

  const browserOptions = {
    headless: !headed,
    ...(browserChannel ? { channel: browserChannel } : {}),
    ...((argValue("proxy") || process.env.NEODIO_PROXY) ? { proxy: { server: argValue("proxy") || process.env.NEODIO_PROXY } } : {}),
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

  if (keepOpen) attachCloseLogging(page, context);

  let status = "success";
  let errorMessage = null;

  try {
    if (htmlFile) {
      await page.setContent(await readFile(htmlFile, "utf8"));
    } else {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      if (await isNaverCaptcha(page)) {
        if (!headed) {
          // 화면 없는 실행은 캡차를 풀 수 없다 — 결과를 남기지 않고 종료 코드 3으로 알려, 수집기가 창을 띄워 다시 시도하게 한다.
          console.error("naver captcha: headless run cannot solve it");
          await context.close().catch(() => {});
          process.exit(CAPTCHA_EXIT_CODE);
        }
        console.error(`네이버 캡차가 떴습니다. 열린 Chrome 창에서 풀어 주세요 (최대 ${Math.round((captchaWaitMs || 300_000) / 1000)}초 대기).`);
        const until = Date.now() + (captchaWaitMs || 300_000);
        while ((await isNaverCaptcha(page)) && Date.now() < until) await page.waitForTimeout(2_000);
        if (await isNaverCaptcha(page)) throw new Error("naver captcha not solved in time");
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      }
      if (overview) {
        await waitForOverview(page, Math.min(timeoutMs, 15_000));
      } else {
        await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        if (clickToStart) {
          await page.mouse.click(680, 520);
          await page.waitForTimeout(1_000);
        }
        await waitForAiAnswer(page, timeoutMs, minWaitMs);
      }
      await page.getByText("자세히 더보기").first().click({ timeout: 5_000 }).catch(() => {});
      await waitForAiAnswer(page, Math.min(timeoutMs, 20_000), 0);
      await page.getByText(/출처 \d+건 전체보기/).first().click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
    if (htmlFile) {
      await waitForStableText(page, timeoutMs);
    }

    const rawResponse = normalizeMultiline(await pickAnswerText(page, query));
    const citations = await collectCitations(page, overview);
    const artifactId = Date.now();
    const screenshotPath = path.join(outputDir, `${filePrefix}-${artifactId}.png`);
    const htmlPath = path.join(outputDir, `${filePrefix}-${artifactId}.html`);
    await writeFile(htmlPath, await page.content(), "utf8");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (rawResponse.length < 180) {
      status = "failed";
      errorMessage = "empty_ai_briefing: Naver did not render an AI briefing for this query, or the AI briefing DOM changed.";
    }

    const result = {
      promptRun: {
        id: `run-${filePrefix}-${Date.now()}`,
        promptId,
        llmModelId: modelId,
        marketId,
        runAt,
        status,
        rawResponse,
        rawMetadata: {
          collectionJobId: process.env.NEODIO_COLLECTION_JOB_ID || undefined,
          source: sourceName,
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

    const outputPath = path.join(outputDir, `${filePrefix}-${runAt.replaceAll(":", "-")}.json`);
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({ status, outputPath, answerTextLength: rawResponse.length, citations: citations.length }, null, 2));
  } catch (error) {
    if (isBrowserClosedError(error)) {
      // 창이 중간에 닫혔다 — 결과를 남기지 않고 종료 코드 4로 알려 수집기가 새 창으로 다시 시도하게 한다.
      console.error("naver browser closed during collection");
      await browser?.close().catch(() => {});
      process.exit(BROWSER_CLOSED_EXIT_CODE);
    }
    status = "failed";
    const outputPath = path.join(outputDir, `${filePrefix}-${runAt.replaceAll(":", "-")}.json`);
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          promptRun: {
            id: `run-${filePrefix}-${Date.now()}`,
            promptId,
            llmModelId: modelId,
            marketId,
            runAt,
            status,
            rawResponse: "",
            rawMetadata: {
              collectionJobId: process.env.NEODIO_COLLECTION_JOB_ID || undefined,
              source: sourceName,
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
    if (keepOpen && !browser) {
      console.log("--keep-open: 브라우저 창을 닫을 때까지 종료하지 않습니다.");
      await new Promise((resolve) => context.on("close", resolve));
    } else if (browser) {
      await browser.close();
    } else {
      await context.close();
    }
  }
}

main();
