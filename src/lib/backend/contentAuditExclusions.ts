import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// "복잡한 콘텐츠 단순화"/"관련 FAQ 추가"/"멀티미디어 가시성 보강"/"목차 추가"
// 4개 콘텐츠 감사 기회에서, 해당 없는 URL(예: 감사말 페이지라 FAQ가 필요
// 없음)을 "제외"로 표시해두면 "수정 필요" 목록에서 빠진다. 지표별로 따로
// 저장 — 같은 URL이라도 "복잡도는 제외했지만 FAQ는 아직 필요"할 수 있다.
const FILE_PATH = ".tmp/content-audit-excluded.json";

async function readAll(): Promise<Record<string, string[]>> {
  const filePath = path.join(process.cwd(), FILE_PATH);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

// 실 DB로 옮길 때 조직별로 행을 나눠야 하므로, 지금은 조직이 하나뿐이라도
// 키에 orgId를 미리 섞어 넣는다 — 나중에 orgId 컬럼을 추가하기만 하면 된다.
function scopedKey(orgId: string, metricKey: string): string {
  return `${orgId}::${metricKey}`;
}

export async function getExcludedUrls(orgId: string, metricKey: string): Promise<Set<string>> {
  const all = await readAll();
  return new Set(all[scopedKey(orgId, metricKey)] ?? []);
}

export async function setUrlExcluded(orgId: string, metricKey: string, url: string, excluded: boolean): Promise<void> {
  const filePath = path.join(process.cwd(), FILE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  const all = await readAll();
  const key = scopedKey(orgId, metricKey);
  const set = new Set(all[key] ?? []);
  if (excluded) set.add(url);
  else set.delete(url);
  all[key] = [...set];
  await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}
