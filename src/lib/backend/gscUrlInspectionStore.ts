import { getPromptStore } from "./database";
import { GscUrlIndexStatus } from "@/lib/db/types";

// URL Inspection API 결과 캐시 — 호출마다 실 API를 치면 느리고 쿼터도
// 쓰므로, URL별 최신 결과를 남겨두고 "재확인" 버튼을 눌러야만 다시
// 호출한다. 페이지 최초 로드 시엔 마지막으로 확인한 결과를 그대로
// 보여준다. bridge_entries(조직/스코프/키 기반 범용 저장소)를 재사용 —
// 예전엔 .tmp/*.json 파일로 뒀는데 Vercel의 읽기 전용 파일시스템에서
// mkdir ENOENT로 깨졌다.
const SCOPE = "gsc-url-inspection";

export async function getCachedUrlIndexStatuses(orgId: string): Promise<Record<string, GscUrlIndexStatus>> {
  const store = await getPromptStore();
  return store.bridgeScope<GscUrlIndexStatus>(orgId, SCOPE);
}

export async function getCachedUrlIndexStatus(orgId: string, url: string): Promise<GscUrlIndexStatus | null> {
  const all = await getCachedUrlIndexStatuses(orgId);
  return all[url] ?? null;
}

export async function setCachedUrlIndexStatus(orgId: string, url: string, status: GscUrlIndexStatus): Promise<void> {
  const store = await getPromptStore();
  await store.putBridge(orgId, SCOPE, { [url]: status });
}
