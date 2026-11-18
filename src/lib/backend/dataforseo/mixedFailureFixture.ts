import { getPromptStore } from "@/lib/backend/database";
import { registerLegacyRequest } from "./legacyRequest";
import { CollectionQueueService } from "./collectionQueue";
import { PostgresCollectionRequestStore } from "./collectionRequestStore";
import type { DataForSeoSurface } from "./types";

/** Terminal rows only, atomically committed: no worker can submit the fixture. */
export async function createMixedFailureFixture(org: string, brand: string) {
  const db = await getPromptStore();
  return db.transaction(async () => {
    const clientId = `fixture-mixed-failures-v1:${brand}`;
    const requests = new PostgresCollectionRequestStore();
    await requests.lockClientRequest(org, clientId);
    const existing = await requests.getByClientRequestId(org, clientId);
    if (existing) return existing.id;
    const [prompt] = await db.query<{ id: string; text: string }>(`SELECT p.id,p.text FROM prompts p JOIN prompt_tracking t ON t.organization_id=p.organization_id AND t.prompt_id=p.id
      WHERE p.organization_id=$1 AND t.brand_id=$2 AND t.status='active' ORDER BY p.id LIMIT 1`, [org, brand]);
    if (!prompt) throw new Error("fixture를 만들려면 이 브랜드에 활성 프롬프트가 필요합니다.");
    const local = await registerLegacyRequest(org, brand, clientId, null, ["naver-ai", "naver-aio", "google-ai-mode", "google-aio", "gemini"].map(surface => ({ query: prompt.text, promptId: prompt.id, surface, device: "desktop" })));
    await new CollectionQueueService().appendApproved({ organizationId: org, brandId: brand, clientRequestId: clientId, requestKind: "manual", reuseActive: false,
      tasks: (["google-aio", "google-ai-mode", "naver-aio"] as DataForSeoSurface[]).flatMap(surface => (surface === "google-aio" ? ["desktop", "mobile"] as const : ["desktop"] as const).map(device => ({ query: prompt.text, promptId: prompt.id, surface, device, marketId: "market-kr", scheduledWindow: `manual:${clientId}` }))) });
    await db.query(`UPDATE legacy_collection_items SET status=CASE WHEN surface='gemini' THEN 'cancelled' ELSE 'parse_failed' END,
      completed_at=now(),error_message='[fixture] 로컬 수집 실패/중단 테스트 데이터 · 실제 수집 안 함',last_seen_at=now()-interval '1 hour' WHERE collection_request_id=$1`, [local.requestId]);
    await db.query(`UPDATE provider_tasks SET status=CASE WHEN surface='naver-aio' THEN 'parse_failed' ELSE 'provider_failed' END,
      completed_at=now(),error_code='FIXTURE_FAILURE',error_message='[fixture] SERP API 실패 테스트 데이터 · 실제 API 호출 안 함',actual_cost_usd=0 WHERE collection_request_id=$1`, [local.requestId]);
    return local.requestId;
  });
}
