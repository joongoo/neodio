import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSpeedResult } from "@/lib/db/types";

// PageSpeed Insights 결과 캐시 — Lighthouse 실행에 5~10초가 걸리고 쿼터도
// 쓰므로, URL별 마지막 결과를 파일에 남겨 "재확인" 버튼을 눌러야만 다시
// 호출한다.
const FILE_PATH = ".tmp/pagespeed-insights.json";

async function readAll(): Promise<Record<string, PageSpeedResult>> {
  const filePath = path.join(process.cwd(), FILE_PATH);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getCachedPageSpeedResults(): Promise<Record<string, PageSpeedResult>> {
  return readAll();
}

export async function setCachedPageSpeedResult(url: string, result: PageSpeedResult): Promise<void> {
  const all = await readAll();
  all[url] = result;
  const filePath = path.join(process.cwd(), FILE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}
