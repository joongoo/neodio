import { NextRequest, NextResponse } from "next/server";
import { startSitemapCrawlJob, startUrlRecrawlJob } from "@/lib/backend/sitemapCrawlJobRunner";
import { collectionUsesLocalAgent } from "@/lib/backend/collectionMode";

// 이 서버가 직접 크롤하는 건 로컬 개발뿐이다(Playwright 브라우저 + `npm run crawl:sitemap` 자식 프로세스).
// 운영(Vercel 서버리스)은 브라우저를 설치할 수도, 오래 실행할 수도 없어서 사용자 PC의 설치형 수집기가
// 크롤하고 화면(브라우저)이 결과를 /api/sitemap-crawl/import로 올린다(src/lib/sitemapCrawlClient.ts).
// 그 경우 여기서는 code: "agent"로 알려 화면이 수집기 흐름으로 넘어가게 한다.
function refuseWhenAgentMode() {
  if (!collectionUsesLocalAgent()) return null;
  return NextResponse.json(
    { error: "이 환경에서는 설치형 수집기로 크롤합니다.", code: "agent" },
    { status: 501 }
  );
}

export async function POST(request: NextRequest) {
  const refused = refuseWhenAgentMode();
  if (refused) return refused;
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
