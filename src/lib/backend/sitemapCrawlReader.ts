import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ContentRecoveryOpportunity, ContentVisibility, SitemapCrawlResult } from "@/lib/db/types";

// Server-only (node:fs) — reads what scripts/crawl-sitemap.mjs actually
// wrote to disk. Never import this from a "use client" component; see the
// collectionRuns.ts / collectionRunsTypes.ts split for why.
const CRAWL_DIR = ".tmp/sitemap-crawl";

export async function getLatestSitemapCrawl(domain: string): Promise<SitemapCrawlResult | null> {
  const dir = path.join(process.cwd(), CRAWL_DIR);
  const filenames = await readdir(dir).catch(() => []);
  const jsonFiles = filenames.filter((f) => f.endsWith(".json"));

  let latest: SitemapCrawlResult | null = null;
  for (const filename of jsonFiles) {
    try {
      const raw = await readFile(path.join(dir, filename), "utf8");
      const parsed = JSON.parse(raw) as SitemapCrawlResult;
      if (parsed.domain !== domain) continue;
      if (!latest || parsed.crawledAt > latest.crawledAt) latest = parsed;
    } catch {
      // skip an unreadable/partial file rather than failing the whole page
    }
  }
  return latest;
}

// 배포 없이 "다시 크롤링"만 반복해서 전/후를 비교하려면 크롤 기록 전체가
// 필요하다 — 매번 새 파일로 저장되므로(scripts/crawl-sitemap.mjs) 그냥 전부
// 모아서 시간순 정렬하면 된다. 새 저장소를 따로 만들 필요가 없다.
export async function getSitemapCrawlHistory(domain: string): Promise<SitemapCrawlResult[]> {
  const dir = path.join(process.cwd(), CRAWL_DIR);
  const filenames = await readdir(dir).catch(() => []);
  const jsonFiles = filenames.filter((f) => f.endsWith(".json"));

  const results: SitemapCrawlResult[] = [];
  for (const filename of jsonFiles) {
    try {
      const raw = await readFile(path.join(dir, filename), "utf8");
      const parsed = JSON.parse(raw) as SitemapCrawlResult;
      if (parsed.domain === domain) results.push(parsed);
    } catch {
      // skip an unreadable/partial file rather than failing the whole page
    }
  }
  return results.sort((a, b) => a.crawledAt.localeCompare(b.crawledAt));
}

// "콘텐츠 가시성 회복" 기회를 실 크롤 기록으로 채운다. 크롤이 1회뿐이면
// 현재 값만, 2회 이상이면 최초(baseline) 대비 최신 크롤의 전/후 비교까지
// 채운다 — 배포 없이 재크롤만 반복해서 얻는 비교라 새 인프라가 필요 없다.
export function buildContentRecoveryFromCrawlHistory(history: SitemapCrawlResult[]): ContentRecoveryOpportunity | null {
  if (history.length === 0) return null;
  const latest = history[history.length - 1];
  const baseline = history[0];

  const successUrls = latest.urls.filter((u) => u.status === "success");
  if (successUrls.length === 0) return null;

  const average = (urls: typeof successUrls) =>
    urls.length > 0 ? Math.round(urls.reduce((sum, u) => sum + u.contentVisibility, 0) / urls.length) : 0;
  const latestAverage = average(successUrls);

  const baselineByUrl = new Map(baseline.urls.map((u) => [u.url, u.contentVisibility]));

  // 배포 없이 재크롤만으로 판단 — 콘텐츠 가시성이 임계치 이상이면 "수정
  // 완료"로 간주한다. "수정 완료" 버튼을 누르면 그 URL만 다시 크롤링해서
  // 이 값을 갱신하고, 임계치를 못 넘기면 자동으로 "현재 제안"에 남는다.
  const OPTIMIZED_THRESHOLD = 70;
  const urls: ContentRecoveryOpportunity["urls"] = successUrls
    .map((u, i) => ({
      id: `real-cr-${i}`,
      url: u.url,
      status: u.contentVisibility >= OPTIMIZED_THRESHOLD ? ("optimized" as const) : ("not_optimized" as const),
      contentVisibility: u.contentVisibility,
      priorityScore: Number(((100 - u.contentVisibility) / 10).toFixed(1)),
      previousContentVisibility: history.length > 1 ? baselineByUrl.get(u.url) : undefined,
    }))
    .sort((a, b) => a.contentVisibility - b.contentVisibility);

  const comparison =
    history.length > 1
      ? (() => {
          const baselineSuccess = baseline.urls.filter((u) => u.status === "success");
          const baselineAverage = average(baselineSuccess);
          return {
            baselineCrawledAt: baseline.crawledAt,
            baselineAverageContentVisibility: baselineAverage,
            latestCrawledAt: latest.crawledAt,
            latestAverageContentVisibility: latestAverage,
            improvementPercent: baselineAverage > 0 ? Math.round(((latestAverage - baselineAverage) / baselineAverage) * 100) : 0,
          };
        })()
      : undefined;

  return {
    title: "콘텐츠 가시성 회복",
    affectedUrls: urls.filter((u) => u.contentVisibility < 50).length,
    expectedVisibilityMultiplier: latestAverage > 0 ? Number((100 / Math.max(latestAverage, 1)).toFixed(1)) : 0,
    averageContentVisibility: latestAverage,
    description:
      "AI 에이전트는 접근 가능한 콘텐츠만 읽고 인용할 수 있습니다. 이 기회는 실제 사이트맵 크롤(raw HTML 대비 렌더링 비교)로 측정한 콘텐츠 가시성이 낮은 페이지를 찾아줍니다.",
    optimizedCount: urls.filter((u) => u.status === "optimized").length,
    totalCount: urls.length,
    urls,
    comparison,
  };
}

// Turns a real crawl into the same shape ContentVisibilityCard already
// renders, so the card doesn't need to know whether its data came from a
// crawl or the seeded fallback. `fallback` only supplies buttonLabel/cta —
// static copy that isn't derived from crawl numbers.
export function buildContentVisibilityFromCrawl(
  crawl: SitemapCrawlResult,
  fallback: Pick<ContentVisibility, "buttonLabel" | "cta">
): ContentVisibility {
  const succeeded = crawl.urls.filter((u) => u.status === "success");
  const visiblePercent =
    succeeded.length > 0 ? Math.round(succeeded.reduce((sum, u) => sum + u.contentVisibility, 0) / succeeded.length) : 0;

  const statusLabel =
    visiblePercent >= 80
      ? "높음 — 대부분의 콘텐츠가 AI 모델에 정상 노출됨"
      : visiblePercent >= 50
        ? "보통 — 일부 콘텐츠가 AI 모델에 노출되지 않음"
        : "낮음 — 대부분의 콘텐츠가 AI 모델에 노출되지 않음";

  const headline =
    visiblePercent >= 80 ? "AI가 대부분의 콘텐츠를 잘 인식하고 있습니다" : "AI가 일부 콘텐츠를 인식하지 못하고 있습니다";

  const crawledAtKst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(new Date(crawl.crawledAt))
    .reduce((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: p.value }), {} as Record<string, string>);

  return {
    visiblePercent,
    statusLabel,
    headline,
    detail: `사이트맵 크롤 결과 기준입니다 (${succeeded.length}/${crawl.urls.length}개 URL 성공, ${crawledAtKst.year}-${crawledAtKst.month}-${crawledAtKst.day} ${crawledAtKst.hour}:${crawledAtKst.minute} KST 수집).`,
    buttonLabel: fallback.buttonLabel,
    cta: fallback.cta,
  };
}

// No crawl to measure yet — prompts the user toward the actual next step
// (register a sitemap, or run the crawl that's already registered) instead
// of showing a percent that isn't real.
export function buildEmptyContentVisibility(
  reason: "no_sitemap" | "not_crawled",
  brandId: string | null
): ContentVisibility {
  const buttonHref = brandId ? `/brands-management/${brandId}` : "/brands-management";

  if (reason === "no_sitemap") {
    return {
      visiblePercent: 0,
      statusLabel: "측정 안 됨 — 사이트맵이 등록되지 않았습니다",
      headline: "콘텐츠 가시성을 측정하려면 사이트맵을 등록하세요",
      detail: "브랜드에 사이트맵 URL을 등록하면 실제 페이지를 크롤링해 AI가 인식하는 콘텐츠 비율을 계산할 수 있습니다.",
      buttonLabel: "사이트맵 등록하러 가기",
      buttonHref,
      cta: {
        title: "사이트맵이 있으면 몇 분 안에 측정할 수 있어요.",
        detail: "브랜드 상세 페이지에서 사이트맵 URL을 입력하고 바로 크롤링을 실행하세요.",
      },
      emptyReason: reason,
    };
  }

  return {
    visiblePercent: 0,
    statusLabel: "측정 안 됨 — 아직 크롤링하지 않았습니다",
    headline: "등록된 사이트맵으로 콘텐츠 가시성을 크롤링해보세요",
    detail: "사이트맵은 등록돼 있지만 아직 크롤을 실행한 적이 없습니다. 지금 크롤링하면 실제 raw HTML 대비 렌더링 비율을 확인할 수 있습니다.",
    buttonLabel: "지금 크롤링하기",
    buttonHref,
    cta: {
      title: "크롤은 브랜드 상세 페이지에서 실행해요.",
      detail: "\"사이트맵 크롤\" 버튼을 누르면 실시간 진행 상황과 함께 결과를 볼 수 있어요.",
    },
    emptyReason: reason,
  };
}
