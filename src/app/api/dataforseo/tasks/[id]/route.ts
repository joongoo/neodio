import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

const TASK_ID = /^ptask-[a-f0-9-]+$/i;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const { id } = await params;
  const brandId = request.nextUrl.searchParams.get("brandId") ?? "";
  if (!TASK_ID.test(id) || !brandId) {
    return NextResponse.json({ error: "유효한 task ID와 brandId가 필요합니다." }, { status: 400 });
  }

  const tenant = await getCurrentTenant();
  const store = new PostgresProviderTaskStore();
  const task = await store.get(id);
  if (!task || task.organizationId !== tenant.orgId || task.brandId !== brandId) {
    return NextResponse.json({ error: "삭제할 작업을 찾을 수 없습니다." }, { status: 404 });
  }
  if (task.status !== "reserved" || task.providerTaskId) {
    return NextResponse.json({ error: "외부 API에 제출되지 않은 예약만 삭제할 수 있습니다." }, { status: 409 });
  }
  if (!(await store.deleteReserved(id, tenant.orgId, brandId))) {
    return NextResponse.json({ error: "작업 상태가 바뀌어 예약을 삭제하지 못했습니다." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
