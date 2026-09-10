import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GscUrlIndexStatus } from "@/lib/db/types";

// URL Inspection API 결과 캐시 — 호출마다 실 API를 치면 느리고 쿼터도
// 쓰므로, URL별 최신 결과를 파일에 남겨두고 "재확인" 버튼을 눌러야만
// 다시 호출한다. 페이지 최초 로드 시엔 마지막으로 확인한 결과를 그대로
// 보여준다.
const FILE_PATH = ".tmp/gsc-url-inspection.json";

async function readAll(): Promise<Record<string, GscUrlIndexStatus>> {
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

export async function getCachedUrlIndexStatuses(): Promise<Record<string, GscUrlIndexStatus>> {
  return readAll();
}

export async function getCachedUrlIndexStatus(url: string): Promise<GscUrlIndexStatus | null> {
  const all = await readAll();
  return all[url] ?? null;
}

export async function setCachedUrlIndexStatus(url: string, status: GscUrlIndexStatus): Promise<void> {
  const all = await readAll();
  all[url] = status;
  const filePath = path.join(process.cwd(), FILE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}
