import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { publicProviderTask } from "@/lib/backend/dataforseo/taskApi";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

export const runtime = "nodejs";

const MAX_BATCH = 20;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const rawTaskIds: unknown[] = Array.isArray(body?.taskIds) ? body.taskIds : [];
  const taskIds = rawTaskIds.length > 0
    ? [...new Set(rawTaskIds.filter((id): id is string => typeof id === "string" && /^ptask-[a-f0-9-]+$/i.test(id)))].slice(0, MAX_BATCH)
    : [];
  if (!brandId || taskIds.length === 0 || taskIds.length !== rawTaskIds.length) {
    return NextResponse.json({ error: `brandId와 최대 ${MAX_BATCH}개의 유효한 taskIds가 필요합니다.` }, { status: 400 });
  }
  const denied = await guardApi("read", { brandId });
  if (denied) return denied;
  const tenant = await getCurrentTenant();

  const tasks = await new PostgresProviderTaskStore().getMany(taskIds);
  if (tasks.length !== taskIds.length || tasks.some((task) => task.organizationId !== tenant.orgId || task.brandId !== brandId)) {
    return NextResponse.json({ error: "조회할 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ tasks: tasks.map(publicProviderTask) });
}
