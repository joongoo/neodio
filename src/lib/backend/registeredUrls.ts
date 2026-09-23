import { getPromptStore } from "./database";

// URL 인스펙터의 "자사 인용 URL" 목록은 지금까지 실제로 인용된 URL만
// 보여줬다 — 아직 인용 안 됐지만 새로 발행해서 추적하고 싶은 콘텐츠를
// 미리 등록해둘 방법이 없었다. bridge_entries(조직/스코프/키 기반 범용
// 저장소)를 재사용해 "추적하고 싶은 URL" 목록만 별도로 둔다. 실제 인용
// 집계(citations 테이블)는 그대로 실측이고, 이 목록은 "0건이어도 표에
// 남겨둘 URL"을 결정하는 데만 쓰인다.
const SCOPE = "registered-urls";

export async function getRegisteredUrls(orgId: string): Promise<string[]> {
  const store = await getPromptStore();
  const entries = await store.bridgeScope<{ addedAt: string }>(orgId, SCOPE);
  return Object.keys(entries);
}

export async function registerUrl(orgId: string, url: string): Promise<void> {
  const store = await getPromptStore();
  await store.putBridge(orgId, SCOPE, { [url]: { addedAt: new Date().toISOString() } });
}

export async function unregisterUrl(orgId: string, url: string): Promise<void> {
  const store = await getPromptStore();
  await store.query("DELETE FROM bridge_entries WHERE organization_id=$1 AND scope=$2 AND entry_key=$3", [orgId, SCOPE, url]);
}
