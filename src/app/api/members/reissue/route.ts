import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { AuthError, reissueTempPassword } from "@/lib/backend/auth/authStore";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 비밀번호를 잊은 구성원에게 임시 비밀번호를 다시 발급 — 이메일 재설정이 없으므로 오너·직원이 대신한다.
export async function POST(request: NextRequest) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  try {
    const tempPassword = await reissueTempPassword(tenant.orgId, String(body?.userId ?? ""), (await getCurrentUser())?.id ?? null);
    return NextResponse.json({ tempPassword });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : 400 });
    throw error;
  }
}
