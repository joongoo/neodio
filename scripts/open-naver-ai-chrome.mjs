#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_QUERY = "아기랑 함께 가기 좋은 국내 여행지 추천";

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

const query = argValue("query", DEFAULT_QUERY);
const port = argValue("port", "9222");
const chromeProfile = argValue("profile", ".tmp/naver-debug-chrome-profile");
const urlArg = argValue("url");

function buildNaverQueryValue(queryText) {
  return queryText.trim().replace(/\s+/g, "+");
}

function buildNaverAiAnswerUrl(queryText) {
  return `https://search.naver.com/search.naver?ssc=tab.ait.all&query=${buildNaverQueryValue(queryText)}&ait_pv=answer`;
}

const url = urlArg ? urlArg : buildNaverAiAnswerUrl(query);

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chromePath)) {
  throw new Error(`Chrome binary not found: ${chromePath}`);
}

const args = [
  "--incognito",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${chromeProfile}`,
  url,
];

const child = spawn(chromePath, args, {
  detached: true,
  stdio: "ignore",
});
child.unref();

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Chrome opened. CDP endpoint: http://127.0.0.1:${port}`);
  }
  process.exit(code ?? 0);
});

console.log(`Chrome opened. CDP endpoint: http://127.0.0.1:${port}`);
