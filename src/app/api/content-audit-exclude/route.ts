import { NextRequest, NextResponse } from "next/server";
import { setUrlExcluded } from "@/lib/backend/contentAuditExclusions";

const VALID_METRICS = new Set(["complexity", "faq", "toc", "multimedia"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const metricKey = typeof body?.metricKey === "string" ? body.metricKey : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const excluded = body?.excluded !== false;

  if (!VALID_METRICS.has(metricKey) || !url) {
    return NextResponse.json({ error: "metricKey와 url이 필요합니다." }, { status: 400 });
  }

  await setUrlExcluded(metricKey, url, excluded);
  return NextResponse.json({ ok: true });
}
