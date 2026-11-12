import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { createDataForSeoOrchestrator } from "@/lib/backend/dataforseo";
import { publicProviderTask, RECOVERABLE_PROVIDER_STATUSES } from "@/lib/backend/dataforseo/taskApi";
import { getCurrentTenant } from "@/lib/backend/tenant";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BATCH = 20;

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const rawTaskIds: unknown[] = Array.isArray(body?.taskIds) ? body.taskIds : [];
  const taskIds = rawTaskIds.length > 0
    ? [...new Set(rawTaskIds.filter((id): id is string => typeof id === "string" && /^ptask-[a-f0-9-]+$/i.test(id)))].slice(0, MAX_BATCH)
    : [];
  if (!brandId || taskIds.length === 0 || taskIds.length !== rawTaskIds.length) {
    return NextResponse.json({ error: `brandId와 최대 ${MAX_BATCH}개의 유효한 taskIds가 필요합니다.` }, { status: 400 });
  }

  const orchestrator = createDataForSeoOrchestrator();
  const owned = [];
  for (const id of taskIds) {
    const task = await orchestrator.get(id);
    if (!task || task.organizationId !== tenant.orgId || task.brandId !== brandId) {
      return NextResponse.json({ error: "조회할 작업을 찾을 수 없습니다." }, { status: 404 });
    }
    owned.push(task);
  }

  const tasks = await Promise.all(owned.map(async (ownedTask) => {
    let task = ownedTask;
    if (RECOVERABLE_PROVIDER_STATUSES.has(task.status)) {
      try {
        task = (await orchestrator.recover(task.id)).task;
      } catch (error) {
        task = await orchestrator.get(task.id) ?? task;
        if (!task.errorMessage) {
          return {
            ...publicProviderTask(task),
            errorCode: "recovery",
            errorMessage: error instanceof Error ? error.message : "DataForSEO 결과 회수에 실패했습니다.",
          };
        }
      }
    }
    return publicProviderTask(task);
  }));

  return NextResponse.json({ tasks });
}
