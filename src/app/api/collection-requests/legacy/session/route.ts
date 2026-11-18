import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { reportLegacySession } from "@/lib/backend/dataforseo/legacySession";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (typeof body?.requestId !== "string" || !["heartbeat", "leave"].includes(body?.action)) return NextResponse.json({ error: "잘못된 세션 요청입니다." }, { status: 400 });
  await reportLegacySession(tenant.orgId, tenant.brandId, body.requestId, body.action);
  return NextResponse.json({ ok: true });
}
