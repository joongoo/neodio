import { momentumLabel, type TrendResult, type TrendSignal } from "@/lib/searchTrend";
import type { SitemapCrawlResult } from "@/lib/db/types";

// "검색어 트렌드 분석"·"사이트맵 크롤 분석" 마법사가 프롬프트에 붙이는 근거 표. 서버 전용 코드를 가져오지 않는 순수 함수라
// 화면·API·테스트가 같은 결과를 낸다.

export interface TrendDigestBatch {
  result: TrendResult;
  signals: TrendSignal[];
  /** 이 묶음이 무엇을 비교하는지(예: "자사 단독", "주제어끼리 비교"). */
  label: string;
  /** 묶음 안의 자사 그룹 이름 — 자사 단독 묶음에서만 있다. */
  ownName?: string;
}

const TRAILING_GENERIC = /\s*(추천|비교|기준|전략|방법|계산|선정|도입|가이드|순서|체크리스트|사례|후기|리뷰|업체|회사)$/;

/** 라이브러리 토픽 이름("마케토 구축 파트너 추천")을 검색창에 실제로 칠 만한 짧은 주제어("마케토 구축 파트너")로 줄인다. */
export function toSearchKeyword(topic: string): string {
  let value = topic.trim();
  for (let i = 0; i < 2; i++) value = value.replace(TRAILING_GENERIC, "");
  return value.trim() || topic.trim();
}

export function formatTrendDigest(brandName: string, batches: TrendDigestBatch[]): string {
  if (batches.length === 0) return "";
  const lines: string[] = [];
  const first = batches[0].result;
  lines.push(
    `네이버 검색 관심도(${first.startDate}~${first.endDate}, 월 단위). 값은 같은 묶음 안에서 가장 큰 값을 100으로 놓은 상대값이라, 서로 다른 묶음의 숫자는 비교하지 마세요. 절대 검색량이 아닙니다.`
  );
  batches.forEach((batch, index) => {
    lines.push("", `[묶음 ${index + 1}] ${batch.label}`);
    const byName = new Map(batch.result.series.map((s) => [s.groupName, s]));
    // 검색량이 너무 적어 집계되지 않은 주제어는 한 줄로 모은다 — 표에 0만 늘어놓으면 LLM이 "관심 없음"으로 오해한다.
    const empty = batch.signals.filter((s) => s.momentum === "none" && s.groupName !== batch.ownName);
    for (const signal of batch.signals.filter((s) => !empty.includes(s))) {
      const series = byName.get(signal.groupName);
      const values = series ? series.data.map((d) => Math.round(d.ratio)).join(",") : "";
      const change = signal.changePercent === null ? "변화율 없음" : `${signal.changePercent >= 0 ? "+" : ""}${signal.changePercent}%`;
      const peak = signal.peak.period ? `정점 ${signal.peak.period.slice(0, 7)}` : "정점 없음";
      const mark = signal.groupName === batch.ownName ? " (자사)" : "";
      lines.push(
        `- ${signal.groupName}${mark}: ${momentumLabel(signal.momentum)}(${change}), 묶음 내 점유 ${Math.round(signal.interestShare * 100)}%, ${peak}, 월별 ${values}`
      );
    }
    if (empty.length) lines.push(`- 검색량이 적어 집계되지 않음(관심도를 판단할 수 없음): ${empty.map((s) => s.groupName).join(", ")}`);
  });
  lines.push("", `우리 브랜드: ${brandName}`);
  return lines.join("\n");
}

const MAX_LISTED_URLS = 30;

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

export function formatSitemapDigest(crawl: SitemapCrawlResult): string {
  const urls = crawl.urls;
  const total = urls.length;
  if (total === 0) return "";
  const ok = urls.filter((u) => u.status === "success");
  const pct = (n: number) => (ok.length ? `${Math.round((n / ok.length) * 100)}%` : "0%");
  const avg = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

  const withoutFaq = ok.filter((u) => u.hasFaq === false);
  const withoutToc = ok.filter((u) => u.hasToc === false);
  const withoutSchema = ok.filter((u) => u.hasStructuredData === false);
  const lowAlt = ok.filter((u) => u.imageAltCoverage !== undefined && u.imageAltCoverage < 50);
  const lowVisibility = ok.filter((u) => u.contentVisibility < 60);
  const failed = urls.filter((u) => u.status === "failed");

  const lines: string[] = [];
  lines.push(
    `사이트맵 크롤 결과(${crawl.domain}, ${crawl.crawledAt.slice(0, 10)} 수집): 사이트맵 URL ${total}개 중 ${ok.length}개 수집 성공, ${failed.length}개 실패.`,
    `- 콘텐츠 가시성(렌더링 텍스트가 원문에서 보이는 비율) 평균 ${avg(ok.map((u) => u.contentVisibility))}점, 60점 미만 ${lowVisibility.length}개`,
    `- FAQ 없음 ${withoutFaq.length}개(${pct(withoutFaq.length)}), 목차 없음 ${withoutToc.length}개(${pct(withoutToc.length)}), 구조화 데이터 없음 ${withoutSchema.length}개(${pct(withoutSchema.length)}), 이미지 alt 50% 미만 ${lowAlt.length}개`
  );
  const lowComplexity = ok.filter((u) => u.complexityScore !== undefined && u.complexityScore < 50);
  if (lowComplexity.length) lines.push(`- 읽기 어려운 문장(가독성 50점 미만) ${lowComplexity.length}개`);

  lines.push("", `수집한 페이지 주소(주제 파악용, 최대 ${MAX_LISTED_URLS}개):`);
  for (const u of ok.slice(0, MAX_LISTED_URLS)) {
    const flags = [
      u.hasFaq === false ? "FAQ 없음" : "",
      u.hasToc === false ? "목차 없음" : "",
      u.hasStructuredData === false ? "구조화 데이터 없음" : "",
      u.contentVisibility < 60 ? `가시성 ${u.contentVisibility}` : "",
    ].filter(Boolean);
    lines.push(`- ${pathOf(u.url)}${flags.length ? ` [${flags.join(", ")}]` : ""}`);
  }
  if (failed.length) lines.push("", `수집 실패: ${failed.slice(0, 10).map((u) => pathOf(u.url)).join(", ")}${failed.length > 10 ? " 외" : ""}`);
  return lines.join("\n");
}
