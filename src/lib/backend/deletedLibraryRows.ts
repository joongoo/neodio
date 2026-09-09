import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// 프롬프트 라이브러리의 mock 시드 행(pl-*)은 코드에 박혀있는 데이터라 파일을
// 지울 수가 없다 — 그래서 "삭제"해도 새로고침하면 다시 나타났다. 삭제된
// 시드 id 목록을 실 파일로 남겨두고, 라이브러리를 읽어올 때 이 목록에 있는
// id는 걸러낸다. 추적된 프롬프트(tracked-*)는 파일 자체를 지우면 되니
// 여기 대상이 아니다.
const DELETED_FILE = ".tmp/deleted-library-rows.json";

async function readDeletedIds(): Promise<string[]> {
  const filePath = path.join(process.cwd(), DELETED_FILE);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getDeletedLibraryRowIds(): Promise<Set<string>> {
  return new Set(await readDeletedIds());
}

export async function markLibraryRowDeleted(id: string): Promise<void> {
  const filePath = path.join(process.cwd(), DELETED_FILE);
  await mkdir(path.dirname(filePath), { recursive: true });
  const ids = new Set(await readDeletedIds());
  ids.add(id);
  await writeFile(filePath, `${JSON.stringify([...ids], null, 2)}\n`, "utf8");
}
