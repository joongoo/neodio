import { DatalabError, fetchSearchTrend, isDatalabConfigured } from "@/lib/backend/naverDatalab";
import { getSitemapCrawlHistory } from "@/lib/backend/sitemapCrawlReader";
import { getPromptTopicGroups } from "@/lib/backend/promptTopics";
import type { Tenant } from "@/lib/backend/tenant";
import { computeSignals, defaultDateRange, fillPeriods, type TrendResult } from "@/lib/searchTrend";
import { formatSitemapDigest, formatTrendDigest, toSearchKeyword, type TrendDigestBatch } from "@/lib/strategyDigest";

// 자사는 단독으로 한 번, 주제어는 5개씩 묶어 서로만 비교한다 — 자사와 한 묶음에 넣으면 자사 검색량이 커서 주제어 값이 1~3으로 눌린다.
const TOPICS_PER_BATCH = 5;
const MAX_BATCHES = 2;
const MAX_KEYWORDS = 20;

export type DigestResult = { ok: true; digest: string; keywords?: string[] } | { ok: false; error: string };

const MAX_TOPIC_KEYWORDS = TOPICS_PER_BATCH * MAX_BATCHES;

/** keywords를 주면 그 주제어로, 없으면 라이브러리 토픽을 줄인 주제어로 조회한다. 쓴 주제어는 응답에 담아 화면에서 고치게 한다. */
export async function buildTrendDigest(tenant: Tenant, requested?: string[]): Promise<DigestResult> {
  if (!isDatalabConfigured()) return { ok: false, error: "네이버 API 키가 설정되지 않았습니다." };
  const brand = tenant.brand;
  if (!brand) return { ok: false, error: "브랜드를 먼저 등록하세요." };

  const anchor = { groupName: brand.name, keywords: Array.from(new Set([brand.name, ...brand.aliases].map((k) => k.trim()).filter(Boolean))).slice(0, MAX_KEYWORDS) };
  const brandKeys = new Set(anchor.keywords.map((k) => k.toLocaleLowerCase("ko-KR")));
  // 라이브러리에 있는 토픽 이름이 자사가 실제로 다루는 주제 — 자사 이름과 겹치는 것은 뺀다.
  const candidates = requested?.length ? requested : (await getPromptTopicGroups(tenant.orgId)).map((g) => toSearchKeyword(g.topic));
  const topicNames = Array.from(new Set(candidates.map((t) => t.trim()).filter(Boolean)))
    .filter((t) => !brandKeys.has(t.toLocaleLowerCase("ko-KR")))
    .slice(0, MAX_TOPIC_KEYWORDS);

  const chunks: string[][] = [];
  for (let i = 0; i < topicNames.length && chunks.length < MAX_BATCHES; i += TOPICS_PER_BATCH) chunks.push(topicNames.slice(i, i + TOPICS_PER_BATCH));

  const range = defaultDateRange("month");
  const batches: TrendDigestBatch[] = [];
  try {
    const plans = [
      { label: "자사 단독", ownName: anchor.groupName, groups: [anchor] },
      ...chunks.map((chunk, i) => ({ label: `주제어끼리 비교${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""}`, ownName: undefined, groups: chunk.map((t) => ({ groupName: t, keywords: [t] })) })),
    ];
    for (const plan of plans) {
      const res = await fetchSearchTrend({ ...range, timeUnit: "month", keywordGroups: plan.groups });
      const result: TrendResult = fillPeriods({
        startDate: res.startDate,
        endDate: res.endDate,
        timeUnit: res.timeUnit,
        series: res.results.map((r) => ({ groupName: r.title, keywords: r.keywords, data: r.data })),
      });
      batches.push({ result, signals: computeSignals(result), label: plan.label, ownName: plan.ownName });
    }
  } catch (error) {
    if (error instanceof DatalabError) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, digest: formatTrendDigest(brand.name, batches), keywords: topicNames };
}

export async function buildSitemapDigest(tenant: Tenant): Promise<DigestResult> {
  const history = await getSitemapCrawlHistory(tenant.org.domain);
  const latest = history[history.length - 1];
  if (!latest) return { ok: false, error: "사이트맵 크롤 결과가 없습니다. 브랜드 설정에서 사이트맵을 크롤링한 뒤 다시 시도하세요." };
  const digest = formatSitemapDigest(latest);
  return digest ? { ok: true, digest } : { ok: false, error: "크롤 결과에 수집된 URL이 없습니다." };
}
