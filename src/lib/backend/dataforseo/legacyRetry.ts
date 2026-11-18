import { getPromptStore } from "@/lib/backend/database";
import { registerLegacyRequest, type LegacyPlannedItem } from "./legacyRequest";
import { legacyRetrySteps } from "@/lib/legacyRetrySteps";

export class LegacyRetryConflict extends Error {}

export async function retryLegacyRequest(org: string, brand: string, originalId: string, clientId: string, actor: string | null, selection?: { itemIds: string[]; action: "start" | "retry" | "cancel" }) {
  const db = await getPromptStore();
  return db.transaction(async () => {
    const [original] = await db.query("SELECT id FROM collection_requests WHERE id=$1 AND organization_id=$2 AND brand_id=$3 FOR UPDATE", [originalId, org, brand]);
    if (!original) return null;
    const existing = await db.query<{ id: string }>("SELECT id FROM collection_requests WHERE organization_id=$1 AND brand_id=$2 AND client_request_id=$3 AND retry_of_request_id=$4", [org, brand, clientId, originalId]);
    if (existing.length) throw new LegacyRetryConflict("이미 등록된 재시도 요청입니다. 수집 로그를 확인해 주세요.");
    const [{ active }] = await db.query<{ active: boolean }>(`SELECT EXISTS(SELECT 1 FROM collection_requests r JOIN legacy_collection_items i ON i.collection_request_id=r.id
      WHERE r.retry_of_request_id=$1 AND r.organization_id=$2 AND r.brand_id=$3 AND i.status IN ('reserved','collecting')) AS active`, [originalId, org, brand]);
    if (active && selection?.action !== "cancel") throw new LegacyRetryConflict("이미 대기 또는 진행 중인 로컬 재시도 요청이 있습니다.");
    const items = await db.query<Omit<LegacyPlannedItem, "promptId"> & { id: string; promptId: string | null; last_seen_at: string | null; status: string }>(
      `SELECT i.id,i.query_snapshot AS query,i.surface,i.device,i.prompt_id AS "promptId",COALESCE(i.last_seen_at,i.created_at) AS last_seen_at,i.status
       FROM legacy_collection_items i WHERE i.collection_request_id=$1 AND i.organization_id=$2 AND i.brand_id=$3 AND i.status<>'completed'
       AND ($4::text[] IS NULL OR i.id::text=ANY($4::text[]))
       ORDER BY i.created_at,i.id FOR UPDATE`, [originalId, org, brand, selection?.itemIds ?? null]);
    if (selection && items.length !== selection.itemIds.length) throw new LegacyRetryConflict("선택 항목이 변경되었습니다. 새로고침 후 다시 선택해 주세요.");
    if (selection && selection.action !== "retry" && items.some(item => item.status !== "reserved")) throw new LegacyRetryConflict("수집 대기 항목만 시작하거나 취소할 수 있습니다.");
    if (!items.length) throw new LegacyRetryConflict("다시 시도할 미완료 로컬 항목이 없습니다.");
    if (items.some(item => item.status === "parse_failed")) throw new LegacyRetryConflict("분석 실패는 재수집 대상이 아닙니다. 저장된 원본과 분석 오류를 확인해 주세요.");
    const existingRetry = await db.query("SELECT id FROM legacy_collection_items WHERE organization_id=$1 AND brand_id=$2 AND retry_of_task_id=ANY($3::text[]) LIMIT 1", [org, brand, items.map(item => item.id)]);
    if (existingRetry.length) throw new LegacyRetryConflict("이미 재수집이 요청된 항목입니다. 연결된 최신 요청에서 확인해 주세요.");
    const cutoff = Date.now() - 30_000;
    if (items.some(item => ["reserved", "collecting"].includes(item.status) && item.last_seen_at && Date.parse(item.last_seen_at) > cutoff)) {
      throw new LegacyRetryConflict("다른 화면에서 로컬 수집이 진행 중입니다. 해당 화면에서 중단한 후 다시 시도해 주세요. 페이지 이탈 직후에는 최대 30초 후 재시도할 수 있습니다.");
    }
    if (selection?.action === "cancel") {
      await db.query("UPDATE legacy_collection_items SET status='cancelled',completed_at=now(),error_message='사용자가 대기 수집을 취소했습니다.' WHERE id::text=ANY($1::text[])", [items.map(item => item.id)]);
      return { requestId: originalId, steps: [], count: items.length };
    }
    if (items.some(item => item.surface === "google-aio" && !item.promptId)) throw new LegacyRetryConflict("구글 AIO의 원본 프롬프트 연결을 찾을 수 없습니다.");
    const retry = await registerLegacyRequest(org, brand, clientId, actor, items.map(item => ({ ...item, promptId: item.promptId ?? undefined, retryOfTaskId: item.id })), originalId);
    await db.query(`UPDATE legacy_collection_items SET status='cancelled',completed_at=$2,error_message='사용자가 새 요청에서 다시 시도했습니다.'
      WHERE collection_request_id=$1 AND status IN ('reserved','collecting') AND id::text=ANY($3::text[])`, [originalId, new Date().toISOString(), items.map(item => item.id)]);
    return { requestId: retry.requestId, steps: legacyRetrySteps(items, clientId), count: items.length };
  });
}
