import { NextRequest, NextResponse } from "next/server";
import { startSitemapCrawlJob } from "@/lib/backend/sitemapCrawlJobRunner";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const domain = typeof body?.domain === "string" ? body.domain.trim() : "";
  const sitemapUrl = typeof body?.sitemapUrl === "string" ? body.sitemapUrl.trim() : "";

  if (!sitemapUrl) {
    return NextResponse.json({ error: "사이트맵 URL을 입력해주세요." }, { status: 400 });
  }

  const job = startSitemapCrawlJob(domain, sitemapUrl);
  return NextResponse.json({ jobId: job.id });
}
