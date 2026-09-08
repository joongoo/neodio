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

    const contentVisibility =
      renderedTextLength > 0 ? Math.min(100, Math.round((rawTextLength / renderedTextLength) * 100)) : 0;

    return { url, status: "success", rawTextLength, renderedTextLength, contentVisibility, error: null };
  } catch (error) {
    return {
      url,
      status: "failed",
      rawTextLength,
      renderedTextLength: 0,
      contentVisibility: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const sitemapUrl = argValue("sitemap");
  const domain = argValue("domain", "");
  const limit = Number(argValue("limit", String(DEFAULT_LIMIT)));
  const timeoutMs = Number(argValue("timeout-ms", String(DEFAULT_TIMEOUT_MS)));
  const outputDir = argValue("out", ".tmp/sitemap-crawl");

  if (!sitemapUrl) {
    console.error(JSON.stringify({ status: "failed", error: "--sitemap is required" }));
    process.exitCode = 1;
    return;
  }

  await mkdir(outputDir, { recursive: true });

  console.log("STAGE:parse_sitemap");
  const pageUrls = await resolvePageUrls(sitemapUrl, limit);
  console.log(`사이트맵에서 ${pageUrls.length}개 URL 발견`);

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
  const result = { domain, sitemapUrl, crawledAt, urls };
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
