import { getPromptStore } from "./database";

// "복잡한 콘텐츠 단순화"/"관련 FAQ 추가"/"멀티미디어 가시성 보강"/"목차 추가"
// 4개 콘텐츠 감사 기회에서, 해당 없는 URL(예: 감사말 페이지라 FAQ가 필요
// 없음)을 "제외"로 표시해두면 "수정 필요" 목록에서 빠진다. 지표별로 따로
// 저장 — 같은 URL이라도 "복잡도는 제외했지만 FAQ는 아직 필요"할 수 있다.
// bridge_entries(조직/스코프/키 기반 범용 저장소)를 재사용 — 예전엔
// .tmp/*.json 파일로 뒀는데 Vercel의 읽기 전용 파일시스템에서 mkdir
// ENOENT로 깨졌다.
const SCOPE = "content-audit-excluded";

export async function getExcludedUrls(orgId: string, metricKey: string): Promise<Set<string>> {
  const store = await getPromptStore();
  const all = await store.bridgeScope<string[]>(orgId, SCOPE);
  return new Set(all[metricKey] ?? []);
}

export async function setUrlExcluded(orgId: string, metricKey: string, url: string, excluded: boolean): Promise<void> {
  const set = await getExcludedUrls(orgId, metricKey);
  if (excluded) set.add(url);
  else set.delete(url);
  const store = await getPromptStore();
  await store.putBridge(orgId, SCOPE, { [metricKey]: [...set] });
}
