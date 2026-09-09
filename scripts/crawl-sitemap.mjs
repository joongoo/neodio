#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 15_000;

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

function extractLocs(xml) {
  const matches = xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi);
  return Array.from(matches, (m) => m[1].trim());
}

function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

// Sitemaps are plain XML fetched over HTTP — no headless browser needed
// here (unlike the AI-answer collectors), since a sitemap is a static file
// the server returns directly to any client.
async function fetchXml(url) {
  const res = await fetch(url, { headers: { "user-agent": "NeodioSitemapCrawler/1.0" } });
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status} ${url}`);
  return res.text();
}

// One level of sitemap-index recursion, capped to a handful of child
// sitemaps — enough for real sites without turning one crawl into
// hundreds of HTTP round trips.
async function resolvePageUrls(sitemapUrl, limit) {
  const rootXml = await fetchXml(sitemapUrl);
  if (!isSitemapIndex(rootXml)) {
    return extractLocs(rootXml).slice(0, limit);
  }

  const childSitemaps = extractLocs(rootXml).slice(0, 5);
  const urls = [];
  for (const childUrl of childSitemaps) {
    if (urls.length >= limit) break;
    try {
      const childXml = await fetchXml(childUrl);
      urls.push(...extractLocs(childXml));
    } catch (error) {
      console.log(`STAGE:warn child sitemap failed: ${childUrl} (${error.message})`);
    }
  }
  return urls.slice(0, limit);
}

function stripHtmlToText(html) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

// 복잡도 점수(0~100, 높을수록 읽기 쉬움) — 평균 문장 길이(단어 수)와 평균
// 단어 길이(글자 수)가 짧을수록 LLM/사용자 모두 이해하기 쉽다는 단순
// 휴리스틱. 정확한 언어학적 가독성 지수(Flesch 등)는 아니지만, 같은
// 사이트를 반복 크롤링했을 때 상대적인 전/후 비교에는 충분하다.
function computeComplexityScore(text) {
  const sentences = text.split(/[.!?。\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 100;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgCharsPerWord = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const penalty = avgWordsPerSentence * 1.2 + avgCharsPerWord * 4;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

// FAQ 스키마(schema.org FAQPage) 또는 "자주 묻는 질문"/FAQ 텍스트, 물음표로
// 끝나는 제목이 여러 개 있는지로 FAQ 섹션 존재 여부를 추정한다.
function detectFaq(html, text) {
  if (/"@type"\s*:\s*"FAQPage"/i.test(html)) return true;
  if (/자주\s*묻는\s*질문|frequently\s+asked\s+questions|\bFAQ\b/i.test(text)) return true;
  const questionHeadings = html.match(/<h[2-4][^>]*>[^<]*\?[^<]*<\/h[2-4]>/gi) ?? [];
  return questionHeadings.length >= 2;
}

// 목차(TOC) — "목차"/"Table of Contents" 텍스트, 또는 같은 페이지 앵커
// (href="#...")로만 이루어진 nav/list가 여러 개 있는지로 추정한다.
function detectToc(html, text) {
  if (/목차|table\s+of\s+contents/i.test(text)) return true;
  const anchorLinks = html.match(/href=["']#[^"']+["']/gi) ?? [];
  return anchorLinks.length >= 3;
}

// 이미지 alt 커버리지(0~100%) — alt 속성이 비어있지 않은 <img> 비율.
// 이미지가 아예 없는 페이지는 감점 요인이 없다는 뜻으로 100%.
function computeImageAltCoverage(html) {
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  if (imgTags.length === 0) return 100;
  const withAlt = imgTags.filter((tag) => /\balt=["'][^"']+["']/i.test(tag)).length;
  return Math.round((withAlt / imgTags.length) * 100);
}

async function crawlUrl(page, url, timeoutMs) {
  let rawTextLength = 0;
  try {
    const res = await fetch(url, { headers: { "user-agent": "NeodioSitemapCrawler/1.0" } });
    const html = await res.text();
    rawTextLength = stripHtmlToText(html).length;
  } catch {
    // raw fetch failing (network/DNS) still lets the render attempt run below
  }

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 8_000) }).catch(() => {});
    const renderedTextLength = await page.evaluate(() => document.body.innerText.length);
    const renderedText = await page.evaluate(() => document.body.innerText);
    const renderedHtml = await page.content();

    const contentVisibility =
      renderedTextLength > 0 ? Math.min(100, Math.round((rawTextLength / renderedTextLength) * 100)) : 0;

    return {
      url,
      status: "success",
      rawTextLength,
      renderedTextLength,
      contentVisibility,
      complexityScore: computeComplexityScore(renderedText),
      hasFaq: detectFaq(renderedHtml, renderedText),
      hasToc: detectToc(renderedHtml, renderedText),
      imageAltCoverage: computeImageAltCoverage(renderedHtml),
      error: null,
    };
  } catch (error) {
    return {
      url,
      status: "failed",
      rawTextLength,
      renderedTextLength: 0,
      contentVisibility: 0,
      complexityScore: 0,
      hasFaq: false,
      hasToc: false,
      imageAltCoverage: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const sitemapUrl = argValue("sitemap");
  // --urls는 사이트맵 전체 대신 특정 URL 몇 개만 다시 크롤링할 때 쓴다 —
  // "기회" 화면의 "수정 완료" 재검토(단일 URL) 같은 경우. 결과 파일 포맷은
  // 사이트맵 크롤과 완전히 같아서(.tmp/sitemap-crawl에 같이 쌓임) 전/후
  // 비교 로직이 그대로 재사용된다.
  const urlsArg = argValue("urls");
  const domain = argValue("domain", "");
  const limit = Number(argValue("limit", String(DEFAULT_LIMIT)));
  const timeoutMs = Number(argValue("timeout-ms", String(DEFAULT_TIMEOUT_MS)));
  const outputDir = argValue("out", ".tmp/sitemap-crawl");

  if (!sitemapUrl && !urlsArg) {
    console.error(JSON.stringify({ status: "failed", error: "--sitemap or --urls is required" }));
    process.exitCode = 1;
    return;
  }

  await mkdir(outputDir, { recursive: true });

  let pageUrls;
  if (urlsArg) {
    pageUrls = urlsArg.split(",").map((u) => u.trim()).filter(Boolean);
    console.log(`재크롤 대상 ${pageUrls.length}개 URL`);
  } else {
    console.log("STAGE:parse_sitemap");
    pageUrls = await resolvePageUrls(sitemapUrl, limit);
    console.log(`사이트맵에서 ${pageUrls.length}개 URL 발견`);
  }

  console.log("STAGE:crawl_pages");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 NeodioSitemapCrawler/1.0" });
  const page = await context.newPage();

  const urls = [];
  for (const url of pageUrls) {
    const result = await crawlUrl(page, url, timeoutMs);
    urls.push(result);
    console.log(`${result.status === "success" ? "OK" : "FAIL"} ${result.contentVisibility}% ${url}`);
  }

  await browser.close();

  const crawledAt = new Date().toISOString();
  const result = { domain, sitemapUrl: sitemapUrl ?? "manual-recheck", crawledAt, urls };
  const outputPath = path.join(outputDir, `sitemap-crawl-${crawledAt.replaceAll(":", "-")}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const avg = urls.length > 0 ? Math.round(urls.reduce((sum, u) => sum + u.contentVisibility, 0) / urls.length) : 0;
  console.log(
    JSON.stringify({
      status: "success",
      outputPath,
      urlCount: urls.length,
      averageContentVisibility: avg,
    })
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
