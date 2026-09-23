import { NextRequest, NextResponse } from "next/server";
import { registerUrl, unregisterUrl } from "@/lib/backend/registeredUrls";
import { DEFAULT_ORG_ID } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }
  await registerUrl(DEFAULT_ORG_ID, url);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }
  await unregisterUrl(DEFAULT_ORG_ID, url);
  return NextResponse.json({ ok: true });
}
