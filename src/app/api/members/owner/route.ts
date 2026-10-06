import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { AuthError, setOwner } from "@/lib/backend/auth/authStore";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 오너 이전 — 조직의 다른 admin을 오너로 지정한다(오너는 조직당 1명).
export async function POST(request: NextRequest) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  try {
    await setOwner(tenant.orgId, String(body?.userId ?? ""), (await getCurrentUser())?.id ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : 403 });
    throw error;
  }
}
