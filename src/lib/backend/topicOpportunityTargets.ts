import { getPromptStore } from "./database";

// "토픽 기회"용으로 만든 콘텐츠 페이지 URL을 토픽 텍스트에 매핑해서 저장한다
// — 실행마다 다시 계산되는 real-topic-rows(getRealTopicRows)는 안정적인
// id가 없어서(토픽 텍스트 자체가 곧 id) 텍스트를 키로 쓴다. bridge_entries
// (조직/스코프/키 기반 범용 저장소)를 재사용 — 예전엔 .tmp/*.json 파일로
// 뒀는데 Vercel의 읽기 전용 파일시스템에서 mkdir ENOENT로 깨졌다.
const SCOPE = "topic-opportunity-targets";

export async function getTopicOpportunityTargets(orgId: string): Promise<Record<string, string>> {
  const store = await getPromptStore();
  return store.bridgeScope<string>(orgId, SCOPE);
}

export async function setTopicOpportunityTarget(orgId: string, topic: string, targetUrl: string): Promise<void> {
  const store = await getPromptStore();
  if (targetUrl.trim()) {
    await store.putBridge(orgId, SCOPE, { [topic]: targetUrl.trim() });
  } else {
    await store.query("DELETE FROM bridge_entries WHERE organization_id=$1 AND scope=$2 AND entry_key=$3", [orgId, SCOPE, topic]);
  }
}
