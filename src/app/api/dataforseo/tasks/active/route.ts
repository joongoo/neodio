import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const brandId = request.nextUrl.searchParams.get("brandId") ?? "";
  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }

  const tasks = await new PostgresProviderTaskStore().listActive(tenant.orgId, brandId, { manualOnly: true });
  return NextResponse.json({
    tasks: tasks.map((task) => ({
      id: task.id,
      surface: task.surface,
      scheduledWindow: task.scheduledWindow,
    })),
  });
}
