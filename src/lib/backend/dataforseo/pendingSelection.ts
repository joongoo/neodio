import { getPromptStore } from "@/lib/backend/database";
import { LegacyRetryConflict } from "./legacyRetry";

export async function managePendingSerpItems(org: string, brand: string, requestId: string, ids: string[], action: "wake" | "cancel") {
  const db = await getPromptStore();
  return db.transaction(async () => {
    const [request] = await db.query<{ client_request_id: string | null; cancel_requested: boolean; status: string }>(
      "SELECT client_request_id,cancel_requested,status FROM collection_requests WHERE id=$1 AND organization_id=$2 AND brand_id=$3 FOR UPDATE", [requestId, org, brand]);
    if (!request) return null;
    if (action === "wake" && (request.cancel_requested || !["queued", "running"].includes(request.status))) throw new LegacyRetryConflict("중단된 요청은 실행할 수 없습니다. 요청 상태를 확인해 주세요.");
    const tasks = await db.query<{ id: string; status: string; provider_task_id: string | null; submission_attempted_at: string | null; lease_expires_at: string | null; estimated_cost_usd: string }>(
      `SELECT id,status,provider_task_id,submission_attempted_at,lease_expires_at,estimated_cost_usd FROM provider_tasks
       WHERE organization_id=$1 AND brand_id=$2 AND collection_request_id=$3 AND id=ANY($4::text[]) ORDER BY id FOR UPDATE`, [org, brand, requestId, ids]);
    if (tasks.length !== ids.length || tasks.some(task => task.status !== "reserved" || task.provider_task_id || task.submission_attempted_at || (task.lease_expires_at && task.lease_expires_at > new Date().toISOString()))) {
      throw new LegacyRetryConflict("선택 작업이 제출되었거나 worker가 처리 중입니다. 새로고침 후 대기 작업만 다시 선택해 주세요.");
    }
    if (action === "cancel") await db.query(`UPDATE provider_tasks SET status='cancelled',completed_at=$2,updated_at=$2,
      error_code='user_cancelled',error_message='사용자가 미제출 대기 작업을 취소했습니다.',lease_owner=NULL,lease_expires_at=NULL,next_poll_at=NULL
      WHERE id=ANY($1::text[])`, [tasks.map(task => task.id), new Date().toISOString()]);
    return { requestId, clientRequestId: request.client_request_id ?? requestId, count: tasks.length, estimatedCostUsd: tasks.reduce((sum, task) => sum + Number(task.estimated_cost_usd), 0) };
  });
}
