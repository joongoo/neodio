import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { MAX_CRAWLS_PER_IMPORT, sanitizeSitemapCrawl } from "@/lib/sitemapCrawlImport";
import { guardApi } from "@/lib/backend/auth/guard";

// 사이트맵 크롤의 "반영" — 사용자 PC의 설치형 수집기가 크롤한 결과(콘텐츠 가시성·FAQ·목차·복잡도 등)를
// 로그인한 브라우저가 받아 올린다. 지금 보고 있는 조직으로 저장하고, 같은 크롤을 다시 올려도 같은 기록으로
// 덮어쓴다(크롤 시각 기준). 수집기는 서버·DB에 직접 붙지 않는다(docs/collector.md).
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const entries: unknown[] = Array.isArray(body?.crawls) ? body.crawls : [];
  if (entries.length === 0) return NextResponse.json({ error: "반영할 크롤 결과가 없습니다." }, { status: 400 });
  if (entries.length > MAX_CRAWLS_PER_IMPORT) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_CRAWLS_PER_IMPORT}건까지 반영할 수 있습니다.` }, { status: 400 });
  }
  const crawls = entries.map(sanitizeSitemapCrawl);
  if (crawls.some((crawl) => crawl === null)) {
    return NextResponse.json({ error: "크롤 결과 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const sourceJobId = typeof body?.jobId === "string" ? body.jobId.slice(0, 100) : null;
  const store = await getPromptStore();
  await store.transaction(async () => {
    for (const crawl of crawls) await store.saveSitemapCrawl(tenant.orgId, crawl!, sourceJobId);
  });
  return NextResponse.json({ imported: crawls.length, urlCount: crawls.reduce((sum, crawl) => sum + crawl!.urls.length, 0) });
}
