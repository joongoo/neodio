import { NextRequest, NextResponse } from "next/server";
import { startSitemapCrawlJob, startUrlRecrawlJob } from "@/lib/backend/sitemapCrawlJobRunner";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const domain = typeof body?.domain === "string" ? body.domain.trim() : "";
  const sitemapUrl = typeof body?.sitemapUrl === "string" ? body.sitemapUrl.trim() : "";
  // "기회 > 콘텐츠 가시성 회복"의 "수정 완료" 재검토 — 사이트맵 전체 대신
  // URL 하나(또는 몇 개)만 다시 크롤링할 때 이쪽 경로를 쓴다.
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0) : [];

  if (!sitemapUrl && urls.length === 0) {
    return NextResponse.json({ error: "사이트맵 URL 또는 재크롤할 URL을 입력해주세요." }, { status: 400 });
  }

  const job = urls.length > 0 ? startUrlRecrawlJob(domain, urls) : startSitemapCrawlJob(domain, sitemapUrl);
  return NextResponse.json({ jobId: job.id });
}
