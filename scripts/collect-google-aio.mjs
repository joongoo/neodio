#!/usr/bin/env node

// Collects one Google AI Overview (AIO) snapshot for one keyword on the plain
// SERP — not AI Mode (collect-google-ai.mjs, udm=50), which is a different
// surface. Used by the YouTube AIO tracker (docs/youtube-aio-tracker-plan.md):
// scripts/collect-aio.ts runs this per keyword × device and judges the
// resulting citations against the brand's YouTube channels.
//
// Output: one JSON file in --out, path printed as the last stdout line.
//   status: "aio_present" | "aio_absent" | "failed"
//   errorKind: "captcha" | "error" (failed only)

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { lookAround, proxyFromArgs, warmUp } from "./lib/human.mjs";
import { BROWSER_CLOSED_EXIT_CODE, chromeProfileDir, ensureIncognitoCdpEndpoint, isBrowserClosedError, killOwnedChrome } from "./lib/incognito-chrome.mjs";
import { extractAioInPage } from "./lib/aio-extract.mjs";

const DEVICE_PROFILES = {
  desktop: {
    viewport: { width: 1366, height: 900 },
  },
  mobile: {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  },
};

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

function buildAioSearchUrl(query, { country, language }) {
  const params = new URLSearchParams({ q: query.trim(), hl: language, gl: country });
  return `https://www.google.com/search?${params}`;
}

// AIO streams in after the results page loads. Wait until either the AIO
// text stops growing, or — if no AIO heading shows up within minWaitMs —
// conclude the SERP has none.
async function waitForAio(page, { timeoutMs, minWaitMs }) {
  const start = Date.now();
  let previous = -1;
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    const probe = await page
      .evaluate(() => {
        const text = document.body ? document.body.innerText : "";
        const heading = [...document.querySelectorAll("div,span,h1,h2,h3,strong")].find(
          (el) => el.children.length <= 2 && ["AI 개요", "AI Overview"].includes((el.textContent || "").trim()) && el.checkVisibility()
        );
        return { hasHeading: !!heading, length: text.length, sorry: location.pathname.startsWith("/sorry") };
      })
      .catch(() => ({ hasHeading: false, length: 0, sorry: false }));

    if (probe.sorry) return;
    if (!probe.hasHeading) {
      if (Date.now() - start >= minWaitMs) return;
    } else if (probe.length === previous) {
      stable += 1;
      if (stable >= 3) return;
    } else {
      stable = 0;
    }
    previous = probe.length;
    await page.waitForTimeout(1_000);
  }
}

// Citation links are Google redirect wrappers (/goto?url=<opaque token>);
// a no-follow GET reads the real destination off the Location header.
async function resolveRedirect(context, href) {
  try {
    const response = await context.request.get(href, { maxRedirects: 0 });
    return response.headers()["location"] || href;
  } catch {
    return href;
  }
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Same video / same page can appear more than once (panel title + thumbnail,
// ?t= variants) — key YouTube links by video ID, everything else by URL.
function dedupeKey(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^(www|m)\./, "");
    if (host === "youtube.com" && parsed.pathname === "/watch") return `yt:${parsed.searchParams.get("v")}`;
    if (host === "youtu.be") return `yt:${parsed.pathname.split("/")[1]}`;
    const shorts = parsed.pathname.match(/^\/shorts\/([\w-]{11})/);
    if (host === "youtube.com" && shorts) return `yt:${shorts[1]}`;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

async function applyDeviceProfile(context, page, device, localeTag) {
  const profile = DEVICE_PROFILES[device];
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: profile.viewport.width,
    height: profile.viewport.height,
    deviceScaleFactor: profile.deviceScaleFactor ?? 1,
    mobile: !!profile.isMobile,
  });
  if (profile.userAgent) {
    // UA만 바꾸면 sec-ch-ua·platform이 데스크톱으로 남아 서로 어긋난다 — 같은 기기처럼 맞춘다.
    const major = profile.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? "140";
    await session.send("Emulation.setUserAgentOverride", {
      userAgent: profile.userAgent,
      acceptLanguage: localeTag,
      platform: "Linux armv81",
      userAgentMetadata: {
        brands: [
          { brand: "Chromium", version: major },
          { brand: "Google Chrome", version: major },
          { brand: "Not.A/Brand", version: "24" },
        ],
        fullVersion: `${major}.0.0.0`,
        platform: "Android",
        platformVersion: "14.0.0",
        architecture: "",
        model: "Pixel 8",
        mobile: true,
      },
    });
  }
  if (profile.hasTouch) await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await session.send("Emulation.setLocaleOverride", { locale: localeTag }).catch(() => {});
}

async function main() {
  const query = argValue("query");
  if (!query) throw new Error("--query is required");
  const device = argValue("device", "mobile");
  if (!DEVICE_PROFILES[device]) throw new Error(`--device must be one of ${Object.keys(DEVICE_PROFILES).join(", ")}`);
  const country = argValue("country", "kr");
  const language = argValue("language", "ko");
  const outputDir = argValue("out", ".tmp/google-aio");
  const timeoutMs = Number(argValue("timeout-ms", "40000"));
  const minWaitMs = Number(argValue("min-wait-ms", "8000"));
  const keepOpen = process.argv.includes("--keep-open");
  const captchaWaitMs = Number(argValue("captcha-wait-ms", "300000"));
  const collectedAt = new Date().toISOString();
  const searchUrl = buildAioSearchUrl(query, { country, language });
  const artifactId = `${collectedAt.replaceAll(":", "-")}-${device}`;

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `google-aio-${artifactId}.json`);
  const base = { query, device, country, language, collectedAt, searchUrl };

  const { endpoint, ownedProcess, profileDir } = await ensureIncognitoCdpEndpoint(argValue("cdp-endpoint"), {
    port: 9224,
    proxy: proxyFromArgs(argValue),
    persistentProfileDir: chromeProfileDir(device),
    profilePrefix: "google-aio-auto-chrome",
    missingChromeMessage: `Google Chrome을 찾을 수 없습니다 (${process.platform}). AI Overview 수집은 실제 시크릿 Chrome이 반드시 필요합니다 — Chrome을 설치하거나, 이미 열려 있는 디버그 세션의 --cdp-endpoint를 넘겨주세요.`,
  });
  // "지금 수집"을 중단하면 SIGTERM이 온다 — detached로 띄운 Chrome이 남지 않게 정리하고 끝낸다.
  process.once("SIGTERM", () => {
    killOwnedChrome(ownedProcess, profileDir);
    process.exit(143);
  });
  const browser = await chromium.connectOverCDP(endpoint);
  const localeTag = `${language}-${country.toUpperCase()}`;
  // CDP로 붙은 Chrome은 새 컨텍스트를 만들면 닫힘·미지원 문제가 생길 수 있어, 시크릿 창의 기본 컨텍스트를 쓰고 기기 모양은 탭에 직접 입힌다.
  const context = browser.contexts()[0] || (await browser.newContext({ locale: localeTag }));
  const page = await context.newPage();
  await applyDeviceProfile(context, page, device, localeTag);
  if (keepOpen) {
    const t0 = Date.now();
    const log = (message) => console.error(`[keep-open +${((Date.now() - t0) / 1000).toFixed(1)}s] ${message}`);
    page.on("close", () => log("탭이 닫혔습니다"));
    page.on("crash", () => log("탭이 크래시했습니다"));
    context.on("close", () => log("브라우저 컨텍스트가 닫혔습니다"));
    browser.on("disconnected", () => log("브라우저 연결이 끊겼습니다(Chrome 종료)"));
  }

  let result;
  try {
    await warmUp(page, `https://www.google.com/?hl=${language}&gl=${country}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // 이동이 조용히 실패하면 about:blank에 머문다 — 원인을 모른 채 빈 결과로 끝나지 않게 바로 실패로 알린다.
    if (page.url() === "about:blank") throw new Error("Google 검색 페이지로 이동하지 못했습니다(about:blank에 머묾). 네트워크·프록시 상태를 확인해 주세요.");
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await lookAround(page);
    await waitForAio(page, { timeoutMs, minWaitMs });

    let extracted = await page.evaluate(extractAioInPage, {});
    // 캡차는 이 창(실제 Chrome)에서 사람이 풀면 검색 결과로 돌아온다 — 풀 때까지 기다렸다가 이어서 수집한다.
    if (extracted.state === "captcha") {
      console.error(`Google 캡차가 떴습니다. 열린 Chrome 창에서 풀어 주세요 (최대 ${Math.round(captchaWaitMs / 1000)}초 대기).`);
      const until = Date.now() + captchaWaitMs;
      while (extracted.state === "captcha" && Date.now() < until) {
        await page.waitForTimeout(2_000);
        extracted = await page.evaluate(extractAioInPage, {}).catch(() => ({ state: "captcha" }));
      }
      if (extracted.state !== "captcha") {
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await waitForAio(page, { timeoutMs, minWaitMs });
        extracted = await page.evaluate(extractAioInPage, {});
      }
    }
    const screenshotPath = path.join(outputDir, `google-aio-${artifactId}.png`);
    const htmlPath = path.join(outputDir, `google-aio-${artifactId}.html`);
    await writeFile(htmlPath, await page.content(), "utf8");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const artifacts = { finalUrl: page.url(), screenshotPath, htmlPath };

    if (extracted.state === "captcha") {
      result = { ...base, ...artifacts, status: "failed", errorKind: "captcha", errorMessage: "Google captcha (unusual traffic) page." };
    } else if (extracted.state === "absent" || extracted.sources.length === 0) {
      result = { ...base, ...artifacts, status: "aio_absent", aioText: null, paragraphs: [], sources: [] };
    } else {
      // Resolve every redirect, then collapse duplicates into 1-based
      // positions in display order and remap paragraph references to them.
      const positionByIndex = [];
      const sources = [];
      const positionByKey = new Map();
      for (const source of extracted.sources) {
        const url = await resolveRedirect(context, source.href);
        const key = dedupeKey(url);
        let position = positionByKey.get(key);
        if (position === undefined) {
          sources.push({ position: sources.length + 1, title: source.title, url, domain: hostnameOf(url) });
          position = sources.length;
          positionByKey.set(key, position);
        } else if (!sources[position - 1].title && source.title) {
          sources[position - 1].title = source.title;
        }
        positionByIndex.push(position);
      }
      const paragraphs = extracted.paragraphs.map((paragraph) => ({
        text: paragraph.text,
        sources: [...new Set(paragraph.sources.map((index) => positionByIndex[index]).filter(Boolean))],
      }));
      result = {
        ...base,
        ...artifacts,
        status: "aio_present",
        aioText: extracted.aioText,
        paragraphs,
        sources,
        diagnostics: extracted.diagnostics,
      };
    }
  } catch (error) {
    if (isBrowserClosedError(error)) {
      // 창이 중간에 닫혔다 — 결과를 남기지 않고 종료 코드 4로 알려 수집기가 새 창으로 다시 시도하게 한다.
      console.error("google browser closed during collection");
      if (!keepOpen) killOwnedChrome(ownedProcess, profileDir);
      process.exit(BROWSER_CLOSED_EXIT_CODE);
    }
    result = { ...base, finalUrl: page.url(), status: "failed", errorKind: "error", errorMessage: error instanceof Error ? error.message : String(error) };
  } finally {
    if (!keepOpen) {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      killOwnedChrome(ownedProcess, profileDir);
    }
  }

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: result.status, errorKind: result.errorKind, sources: result.sources?.length ?? 0, outputPath }));
  if (result.status === "failed") process.exitCode = 1;
  // 검색 창을 남겨 둔 채 스크립트만 끝낸다(CDP 연결이 끊겨도 detached Chrome은 그대로 열려 있다).
  if (keepOpen) process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
