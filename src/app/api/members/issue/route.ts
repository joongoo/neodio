import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { AuthError, issueAccount } from "@/lib/backend/auth/authStore";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 계정 발급 — 오너·직원이 아이디·이름·역할·브랜드를 정해 계정을 만든다. 임시 비밀번호를 이 응답에서 한 번만 돌려주고(메일 발송 없음), 첫 로그인 때 바꾸게 한다.
export async function POST(request: NextRequest) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const role = body?.role === "admin" ? "admin" : "viewer";
  try {
    const { user, tempPassword } = await issueAccount(
      tenant.orgId,
      { loginId: String(body?.loginId ?? ""), name: String(body?.name ?? ""), role, brandIds: Array.isArray(body?.brandIds) ? body.brandIds.filter((v: unknown): v is string => typeof v === "string") : [] },
      (await getCurrentUser())?.id ?? null
    );
    return NextResponse.json({ loginId: user.loginId, tempPassword });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === "exists" ? 409 : 400 });
    throw error;
  }
}
