import { NextRequest, NextResponse } from "next/server";
import { startSitemapCrawlJob, startUrlRecrawlJob } from "@/lib/backend/sitemapCrawlJobRunner";

// 실제 크롤(Playwright 브라우저 설치 + npm run crawl:sitemap 자식 프로세스)은
// 로컬 프로세스 전제로 짜여있어서 Vercel 서버리스에서 못 돈다 (읽기전용
// 파일시스템이라 브라우저 설치 불가, 실행시간 제한, 프로세스 스폰 제약).
// 조용히 타임아웃/500으로 죽는 대신 여기서 바로 명확한 이유를 준다.
function refuseOnServerless() {
  if (!process.env.VERCEL) return null;
  return NextResponse.json(
    { error: "사이트맵 크롤은 로컬 개발 환경에서만 실행할 수 있어요. 로컬에서 `npm run crawl:sitemap`을 실행해주세요." },
    { status: 501 }
  );
}

export async function POST(request: NextRequest) {
  const refused = refuseOnServerless();
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
