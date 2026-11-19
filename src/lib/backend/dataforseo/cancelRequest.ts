import { getPromptStore } from "@/lib/backend/database";
import type { PromptStore } from "@/lib/backend/database/store";

/** Stop future submissions, never discard results of a request already sent to the provider. */
export async function cancelCollectionRequest(org: string, brand: string, id: string, database?: PromptStore) {
  const db = database ?? await getPromptStore();
  return db.transaction(async () => {
    const [identity] = await db.query<{ client_request_id: string | null }>("SELECT client_request_id FROM collection_requests WHERE id=$1 AND organization_id=$2 AND brand_id=$3", [id, org, brand]);
    if (!identity) return false;
    // Serialize against split-batch registration too, so no late batch can append after cancellation.
    if (identity.client_request_id) await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`dataforseo-collection:${org}:${identity.client_request_id}`]);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('dataforseo-submit-capacity'))");
    const [request] = await db.query("SELECT id FROM collection_requests WHERE id=$1 AND organization_id=$2 AND brand_id=$3 FOR UPDATE", [id, org, brand]);
    if (!request) return false;
    const now = new Date().toISOString();
    await db.query("UPDATE collection_requests SET cancel_requested=true,attention_reviewed=true,updated_at=$2 WHERE id=$1", [id, now]);
    await db.query(`UPDATE provider_tasks SET status='cancelled',completed_at=$2,updated_at=$2,lease_owner=NULL,lease_expires_at=NULL,next_poll_at=NULL,
      error_code='user_cancelled',error_message='사용자가 수집 요청을 취소했습니다.'
      WHERE collection_request_id=$1 AND organization_id=$3 AND brand_id=$4 AND status='reserved' AND provider_task_id IS NULL AND submission_attempted_at IS NULL`, [id, now, org, brand]);
    // A live collector receives cancellation through its existing heartbeat. Expired sessions need no acknowledgement.
    await db.query(`UPDATE legacy_collection_items SET status='cancelled',completed_at=$2,error_message='사용자가 수집 요청을 취소했습니다.'
      WHERE collection_request_id=$1 AND organization_id=$3 AND brand_id=$4 AND run_id IS NULL
        AND (status='reserved' OR (status='collecting' AND COALESCE(last_seen_at,created_at)<$5))`, [id, now, org, brand, new Date(Date.parse(now) - 30_000).toISOString()]);
    return true;
  });
}
