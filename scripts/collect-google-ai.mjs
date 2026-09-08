#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_QUERY = "B2B 마케팅 솔루션 추천";
const DEFAULT_MARKET_ID = "market-kr";
const DEFAULT_PROMPT_ID = "manual-google-ai-test";
const GOOGLE_AI_MODEL_ID = "model-google-ai-overview";

// Real Chrome install paths per OS — Google collection must always run
// through a real, incognito Chrome (see ensureIncognitoCdpEndpoint below),
// so this needs to resolve on whichever machine runs it, not just this one.
const CHROME_PATH_CANDIDATES = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/google-chrome"],
};

function resolveChromePath() {
  const candidates = CHROME_PATH_CANDIDATES[process.platform] ?? [];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

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

function buildGoogleQueryValue(query) {
  return encodeURIComponent(query.trim());
}

// udm=50 is Google's "AI Mode" surface — a conversational answer plus a
// full source list, not the classic accordion "AI Overview" box. Headless
// Playwright chromium hit a captcha wall against plain google.com/search;
// a real, incognito Chrome window on this AI Mode URL did not. See
// ensureIncognitoCdpEndpoint below — Google collection always goes through
// that real browser now, never the bundled headless one.
function buildGoogleSearchUrl(query) {
  return `https://www.google.com/search?q=${buildGoogleQueryValue(query)}&hl=ko&udm=50`;
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

// Spawns a fresh, disposable incognito Chrome with a CDP debug port and
// waits for it to come up. Google must always be collected through a real,
// private Chrome session — never Playwright's bundled headless chromium —
// so this is the only way into main() when --cdp-endpoint isn't given.
async function ensureIncognitoCdpEndpoint(explicitEndpoint) {
  if (explicitEndpoint) return { endpoint: explicitEndpoint, ownedProcess: null };

  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error(
      `Google Chrome을 찾을 수 없습니다 (${process.platform}). Google AI Mode 수집은 실제 시크릿 Chrome이 반드시 필요합니다 — Chrome을 설치하거나, 이미 열려 있는 디버그 세션의 --cdp-endpoint를 넘겨주세요.`
    );
  }

  const port = 9223;
  const profileDir = path.join(".tmp", `google-ai-auto-chrome-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });

  const child = spawn(
    chromePath,
    ["--incognito", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "about:blank"],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${endpoint}/json/version`);
      if (res.ok) return { endpoint, ownedProcess: child };
    } catch {
      // Chrome still starting up
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting for the incognito Chrome debug port to become ready.");
}

async function waitForAiModeAnswer(page, timeoutMs, minWaitMs) {
  const start = Date.now();
  let previous = -1;
  let stableCount = 0;

  await page.waitForTimeout(minWaitMs);

  while (Date.now() - start < timeoutMs) {
    const length = await page
      .evaluate(() => {
        const el = document.querySelector(".mZJni.Dn7Fzd") || document.querySelector(".CKgc1d");
        return el ? el.innerText.trim().length : 0;
      })
      .catch(() => 0);

    if (length > 100 && length === previous) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
    }

    previous = length;
    await page.waitForTimeout(1_000);
  }
}

async function pickAiModeAnswerText(page) {
  return page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    const clean = document.querySelector(".mZJni.Dn7Fzd");
    if (clean) return normalize(clean.innerText || "");

    // Fallback carries a "<query>에 대한 AI 모드 대답" prefix — strip it.
    const withPrefix = document.querySelector(".CKgc1d");
    return withPrefix ? normalize(withPrefix.innerText || "").replace(/^.*?AI 모드 대답/, "") : "";
  });
}

// AI Mode always pre-renders every source in the DOM behind a "모두 표시"
// (show all) toggle — clicking it just reveals the rest for innerText to
// read, it doesn't fetch anything new. Citation links are Google redirect
// wrappers (/goto?url=<opaque token>), so each is resolved with a
// no-follow GET to read the real destination off the Location header.
async function collectAiModeCitations(page) {
  await page.getByText("모두 표시").first().click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(800);

  const { hrefs, titles } = await page.evaluate(() => {
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const root = document.querySelector('div[role="main"]') || document.body;

    const hrefs = [];
    const seen = new Set();
    for (const anchor of root.querySelectorAll('a[href^="/goto?url="]')) {
      if (!seen.has(anchor.href)) {
        seen.add(anchor.href);
        hrefs.push(anchor.href);
      }
    }

    const fullText = root.innerText;
    const marker = fullText.indexOf("있을 수 있습니다");
    const afterMarkerIdx = marker >= 0 ? fullText.indexOf("\n", marker) : -1;
    const after = afterMarkerIdx >= 0 ? fullText.slice(afterMarkerIdx) : "";
    const lines = after
      .split("\n")
      .map(normalize)
      .filter(Boolean)
      .filter((line) => line !== "모두 표시" && line !== "간략히" && line !== "간략히 표시");

    // Each source renders as a (domain label, title, snippet) triplet, in
    // the same order as the deduped href list above.
    const titles = [];
    for (let i = 0; i + 1 < lines.length; i += 3) {
      titles.push(lines[i + 1] || lines[i]);
    }

    return { hrefs, titles };
  });

  const citations = [];
  for (let i = 0; i < hrefs.length; i++) {
    const href = hrefs[i];
    let finalUrl = href;
    try {
      const response = await page.context().request.get(href, { maxRedirects: 0 });
      finalUrl = response.headers()["location"] || href;
    } catch {
      // keep the redirect link itself as a fallback
    }

    let domain = "";
    try {
      domain = new URL(finalUrl).hostname;
    } catch {
      // leave domain empty if the resolved URL isn't parseable
    }

    citations.push({
      title: titles[i] || domain || finalUrl,
      url: finalUrl,
      domain,
      isOwnDomain: domain === "neodigm.com" || domain.endsWith(".neodigm.com"),
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
  const timeoutMs = Number(argValue("timeout-ms", "45000"));
  const minWaitMs = Number(argValue("min-wait-ms", "8000"));
  const runAt = new Date().toISOString();

  const searchUrl = urlArg || buildGoogleSearchUrl(query);

  await mkdir(outputDir, { recursive: true });

  const { endpoint: cdpEndpoint, ownedProcess } = await ensureIncognitoCdpEndpoint(argValue("cdp-endpoint"));
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0] || (await browser.newContext({ locale: "ko-KR" }));
  const page =
    context.pages().find((candidate) => candidate.url().includes("google.com/search")) || (await context.newPage());

  let status = "success";
  let errorMessage = null;

  try {
    const alreadyOnResultsPage = page.url().includes("google.com/search");
    if (!alreadyOnResultsPage) {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    }
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await waitForAiModeAnswer(page, timeoutMs, minWaitMs);

    const rawResponse = normalizeMultiline(await pickAiModeAnswerText(page));
    const citations = await collectAiModeCitations(page);
    const artifactId = Date.now();
    const screenshotPath = path.join(outputDir, `google-ai-${artifactId}.png`);
    const htmlPath = path.join(outputDir, `google-ai-${artifactId}.html`);
    await writeFile(htmlPath, await page.content(), "utf8");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    if (rawResponse.length < 100) {
      status = "failed";
      errorMessage = "empty_ai_mode_answer: Google did not render an AI Mode answer for this query, or the DOM changed.";
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
          collectedBy: "playwright-incognito-chrome",
          query,
          queryUrl: searchUrl,
          finalUrl: page.url(),
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
              collectedBy: "playwright-incognito-chrome",
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
    await browser.close().catch(() => {});
    if (ownedProcess) {
      try {
        process.kill(-ownedProcess.pid);
      } catch {
        // already exited
      }
    }
  }
}

main();
