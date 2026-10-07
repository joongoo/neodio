import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { canManageUsers } from "@/lib/auth/userManagement";
import { guardApi } from "@/lib/backend/auth/guard";

// 설정 변경 이력(프롬프트 추가·수정·보관, 토픽 묶음, 브랜드 설정) — 최신순, before 이전 시각 커서로 이어서 불러온다.
export async function GET(request: NextRequest) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
  const before = request.nextUrl.searchParams.get("before") ?? undefined;
  const store = await getPromptStore();
  const changes = await store.listChanges(tenant.orgId, { brandId: tenant.brandId || undefined, limit, before, includeUsers: !tenant.principal || canManageUsers(tenant.principal) });
  return NextResponse.json({ changes });
}
