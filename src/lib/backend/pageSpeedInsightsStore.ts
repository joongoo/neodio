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

// url만으로 키를 잡으면 같은 URL의 mobile/desktop 결과가 서로 덮어쓴다 —
// strategy까지 합쳐서 키를 만든다.
function cacheKey(url: string, strategy: PageSpeedResult["strategy"]): string {
  return `${url}::${strategy}`;
}

/** 화면은 전부 mobile 기준 하나만 보여주므로, url 하나당 mobile 결과만 골라 반환한다. */
export async function getCachedPageSpeedResults(
  strategy: PageSpeedResult["strategy"] = "mobile"
): Promise<Record<string, PageSpeedResult>> {
  const all = await readAll();
  const byUrl: Record<string, PageSpeedResult> = {};
  // 키 접미사가 아니라 결과 안의 strategy 필드로 판단한다 — 이전 버전(url만
  // 키로 쓰던 시절)에 저장된 레거시 항목도 strategy 필드는 항상 있었으므로
  // 그대로 걸러낼 수 있다.
  for (const result of Object.values(all)) {
    if (result.strategy === strategy) byUrl[result.url] = result;
  }
  return byUrl;
}

export async function setCachedPageSpeedResult(url: string, result: PageSpeedResult): Promise<void> {
  const all = await readAll();
  all[cacheKey(url, result.strategy)] = result;
  const filePath = path.join(process.cwd(), FILE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}
