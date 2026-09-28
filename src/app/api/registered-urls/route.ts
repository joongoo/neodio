import { NextRequest, NextResponse } from "next/server";
import { registerUrl, unregisterUrl } from "@/lib/backend/registeredUrls";
import { getCurrentTenant } from "@/lib/backend/tenant";

export async function POST(request: NextRequest) {
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
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }
  await unregisterUrl(tenant.orgId, url);
  return NextResponse.json({ ok: true });
}
