// 네이버 데이터랩 검색어 트렌드 — NAVER API HUB(네이버 클라우드 플랫폼 게이트웨이) 기준.
// 인증은 앱 전체에 키 하나(NCP 콘솔에서 발급한 Client ID/Secret). 응답의 ratio는 절대 검색량이
// 아니라 "요청 하나 안에서 최댓값=100"인 상대값이라, 서로 비교할 주제어는 같은 요청의
// keywordGroups에 넣어야 한다(docs/naver-datalab-search-trend-plan.md).

const SEARCH_TREND_URL = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";

export type SearchTrendTimeUnit = "date" | "week" | "month";

export interface SearchTrendKeywordGroup {
  /** 주제어 — 검색어 묶음을 대표하는 이름. */
  groupName: string;
  /** 주제어에 해당하는 검색어(최대 20개). */
  keywords: string[];
}

export interface SearchTrendRequest {
  /** yyyy-mm-dd, 2016-01-01부터 조회 가능. */
  startDate: string;
  endDate: string;
  timeUnit: SearchTrendTimeUnit;
  /** 최대 5개. */
  keywordGroups: SearchTrendKeywordGroup[];
  device?: "pc" | "mo";
  gender?: "m" | "f";
  /** 1: 0~12세, 2: 13~18, 3: 19~24, 4: 25~29, 5: 30~34, 6: 35~39, 7: 40~44, 8: 45~49, 9: 50~54, 10: 55~59, 11: 60세 이상. */
  ages?: string[];
}

export interface SearchTrendApiSeries {
  title: string;
  keywords: string[];
  data: { period: string; ratio: number }[];
}

export interface SearchTrendApiResponse {
  startDate: string;
  endDate: string;
  timeUnit: SearchTrendTimeUnit;
  results: SearchTrendApiSeries[];
}

export class DatalabError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** message는 화면에 그대로 보여도 되는 문장이며 키 값은 절대 포함하지 않는다. */
    readonly code: "not-configured" | "invalid-request" | "quota" | "upstream"
  ) {
    super(message);
  }
}

// 같은 조건 재조회로 일 호출 한도를 낭비하지 않도록 서버 메모리에 잠깐 캐시한다(성공 응답만).
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; value: SearchTrendApiResponse }>();

export function clearSearchTrendCache() {
  cache.clear();
}

export function isDatalabConfigured(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

export async function fetchSearchTrend(request: SearchTrendRequest): Promise<SearchTrendApiResponse> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new DatalabError("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정돼 있지 않습니다.", 503, "not-configured");
  }

  // 선택 필터는 값이 있을 때만 보낸다(빈 ages 배열은 "전체"가 아니라 오류가 될 수 있다).
  const body: Record<string, unknown> = {
    startDate: request.startDate,
    endDate: request.endDate,
    timeUnit: request.timeUnit,
    keywordGroups: request.keywordGroups,
  };
  if (request.device) body.device = request.device;
  if (request.gender) body.gender = request.gender;
  if (request.ages?.length) body.ages = request.ages;

  const cacheKey = JSON.stringify(body);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const res = await fetch(SEARCH_TREND_URL, {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let detail = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw) as { errorMessage?: string; message?: string };
      detail = parsed.errorMessage ?? parsed.message ?? detail;
    } catch {
      // 본문이 JSON이 아니면 잘라낸 원문을 그대로 쓴다.
    }
    console.error(`[naver-datalab] ${res.status}: ${detail}`);
    if (res.status === 429) throw new DatalabError("네이버 API 호출 한도를 넘었습니다. 잠시 뒤 다시 시도하세요.", 429, "quota");
    if (res.status === 400) throw new DatalabError(detail || "요청 값이 올바르지 않습니다.", 400, "invalid-request");
    if (res.status === 401 || res.status === 403) {
      throw new DatalabError("네이버 API 인증에 실패했습니다. Client ID·Secret과 검색어 트렌드 이용 신청 여부를 확인하세요.", 502, "upstream");
    }
    throw new DatalabError(detail || "네이버 검색어 트렌드 조회에 실패했습니다.", 502, "upstream");
  }

  const data = (await res.json()) as Partial<SearchTrendApiResponse>;
  const value: SearchTrendApiResponse = {
    startDate: data.startDate ?? request.startDate,
    endDate: data.endDate ?? request.endDate,
    timeUnit: data.timeUnit ?? request.timeUnit,
    results: (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      keywords: r.keywords ?? [],
      data: (r.data ?? []).map((p) => ({ period: p.period, ratio: p.ratio })),
    })),
  };
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
