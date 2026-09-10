import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// LLM API를 아직 연결하지 않고도 "LLM 기반 추천/가이드" 기능을 먼저 쓸 수
// 있게 하는 우회 저장소 — 사람이 화면에서 포맷된 프롬프트를 복사해 LLM에
// 붙여넣고, 답변을 다시 붙여넣으면 그대로 여기 저장된다. API가 붙으면 이
// 저장소는 그대로 두고 "누가 채우는지"만 사람 → 배치로 바뀐다.
// scope별로 파일 하나, 그 안에서 key(도메인/URL/토픽 등)로 구분한다.
const DIR = ".tmp/llm-bridge";

async function readScope<T>(scope: string): Promise<Record<string, T>> {
  const filePath = path.join(process.cwd(), DIR, `${scope}.json`);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getLlmBridgeScope<T>(scope: string): Promise<Record<string, T>> {
  return readScope<T>(scope);
}

export async function getLlmBridgeEntry<T>(scope: string, key: string): Promise<T | null> {
  const entries = await readScope<T>(scope);
  return entries[key] ?? null;
}

export async function setLlmBridgeEntry<T>(scope: string, key: string, data: T): Promise<void> {
  const entries = await readScope<T>(scope);
  entries[key] = data;
  const filePath = path.join(process.cwd(), DIR, `${scope}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

// 최상단 "한 번에 등록" 마법사용 — 여러 key(검색어/URL 등)를 한 번의
// LLM 답변으로 동시에 채울 때, 파일을 한 번만 읽고 한 번만 쓴다.
export async function setLlmBridgeEntries<T>(scope: string, newEntries: Record<string, T>): Promise<void> {
  const entries = await readScope<T>(scope);
  Object.assign(entries, newEntries);
  const filePath = path.join(process.cwd(), DIR, `${scope}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}
