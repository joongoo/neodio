import { NextRequest, NextResponse } from "next/server";
import { registerUrl, unregisterUrl } from "@/lib/backend/registeredUrls";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }
  await registerUrl(tenant.orgId, url);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }
  await unregisterUrl(tenant.orgId, url);
  return NextResponse.json({ ok: true });
}
