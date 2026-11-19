import { NextRequest, NextResponse } from "next/server";
import { getCollectedRunDetail } from "@/lib/backend/collectionRuns";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";
import { getPromptStore } from "@/lib/backend/database";

// 수집 로그에서 행을 펼칠 때 그 실행의 원문·인용만 불러온다(목록에는 싣지 않는다).
export async function GET(request: NextRequest) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const dir = request.nextUrl.searchParams.get("dir") ?? "";
  const filename = request.nextUrl.searchParams.get("filename") ?? "";
  if (!dir || !filename) return NextResponse.json({ error: "dir과 filename이 필요합니다." }, { status: 400 });
  const tenant = await getCurrentTenant();
  const requestId = request.nextUrl.searchParams.get("requestId");
  const taskId = request.nextUrl.searchParams.get("taskId");
  if (requestId || taskId) {
    if (!requestId || !taskId) return NextResponse.json({ error: "requestId와 taskId가 필요합니다." }, { status: 400 });
    const [allowed] = await (await getPromptStore()).query(
      `SELECT p.id FROM prompt_runs p JOIN collection_execution_items t ON t.id=p.provider_task_id OR t.run_id=p.id
       JOIN collection_requests r ON r.id=t.collection_request_id
       WHERE r.id=$1 AND t.id=$2 AND r.organization_id=$3 AND r.brand_id=$4
         AND t.organization_id=$3 AND t.brand_id=$4 AND p.organization_id=$3
         AND p.source_dir=$5 AND p.source_filename=$6 LIMIT 1`,
      [requestId, taskId, tenant.orgId, tenant.brandId, dir, filename],
    );
    if (!allowed) return NextResponse.json({ error: "실행을 찾을 수 없습니다." }, { status: 404 });
  }
  const detail = await getCollectedRunDetail(tenant.orgId, dir, filename);
  if (!detail) return NextResponse.json({ error: "실행을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(detail);
}
