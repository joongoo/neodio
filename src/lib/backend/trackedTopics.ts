import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PromptLibraryRow } from "@/lib/db/types";

// "토픽 추적하기"(가시성 개요) 클릭은 이전엔 클라이언트 로컬 state만 바꾸고
// 아무 데도 저장되지 않았다 — 새로고침하면 사라지고, 프롬프트 라이브러리에도
// 안 나타났다. 수집 로그와 같은 패턴(.tmp에 실 파일로 저장, 서버 컴포넌트가
// 읽어서 mock과 합침)으로 실제로 프롬프트 라이브러리에 반영되게 한다.
const TRACKED_DIR = ".tmp/tracked-topics";

export async function trackTopic(topic: string, category: string): Promise<void> {
  await mkdir(path.join(process.cwd(), TRACKED_DIR), { recursive: true });
  const row: PromptLibraryRow = {
    id: `tracked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: topic,
    origin: "manual",
    category,
    subcategory: "가시성 개요에서 추적",
    lastModifiedAt: new Date().toISOString().slice(0, 10),
    lastModifiedBy: "나",
  };
  const filePath = path.join(process.cwd(), TRACKED_DIR, `${row.id}.json`);
  await writeFile(filePath, `${JSON.stringify(row, null, 2)}\n`, "utf8");
}

export async function listTrackedTopics(): Promise<PromptLibraryRow[]> {
  const dir = path.join(process.cwd(), TRACKED_DIR);
  const filenames = await readdir(dir).catch(() => []);
  const rows = await Promise.all(
    filenames
      .filter((f) => f.endsWith(".json"))
      .map(async (filename) => {
        try {
          return JSON.parse(await readFile(path.join(dir, filename), "utf8")) as PromptLibraryRow;
        } catch {
          return null;
        }
      })
  );
  return rows.filter((r): r is PromptLibraryRow => r !== null);
}
