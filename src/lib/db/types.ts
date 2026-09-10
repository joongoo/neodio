export interface Organization {
  id: string;
  name: string;
  domain: string;
  logoUrl?: string;
}

export type BrandStatus = "active" | "pending";
export type Sentiment = "positive" | "neutral" | "negative";
export type PromptRunStatus = "success" | "failed" | "pending" | "paused";
export type TrackedItemStatus = "pending_confirmation" | "active" | "archived";

export interface BrandSeed {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  isOwnBrand: boolean;
  status: BrandStatus;
  category: string;
  aliases: string[];
}

export interface DomainSeed {
  id: string;
  organizationId: string;
  brandId: string;
  hostname: string;
  isPrimary: boolean;
}

export interface MarketSeed {
  id: string;
  code: string;
  label: string;
  isWorldwide: boolean;
}

export interface LlmModelSeed {
  id: string;
  name: string;
  provider: string;
  modelKey: string;
  answerSurface: "chat" | "ai_overview" | "ai_search";
}

export interface CategorySeed {
  id: string;
  organizationId: string;
  name: string;
  color: string;
}

export interface TopicSeed {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  searchVolume: number;
  difficulty: number;
  intent: "informational" | "commercial" | "transactional";
}

export interface PromptSeed {
  id: string;
  organizationId: string;
  topicId: string;
  marketId: string;
  text: string;
}

export interface RawCitationMetadata {
  title: string;
  url: string;
  domain: string;
  isOwnDomain: boolean;
}

export interface PromptRunMetadata {
  locale?: string;
  source: "seed" | "naver-ai-search" | "google-ai-overview" | "api" | "headless-browser";
  basedOn?: string[];
  collectedBy?: string;
  query?: string;
  queryUrl?: string;
  finalUrl?: string;
  answerTextLength?: number;
  screenshotPath?: string;
  citations?: RawCitationMetadata[];
  errorMessage?: string | null;
  /** Set from "수집 로그"의 분석 모달 (Brand Management 카테고리와 동일 목록) —
   *  수집 시점엔 카테고리를 안 받으므로, 실행을 나중에 분류해 붙인다. */
  category?: string;
  subcategory?: string;
}

export interface PromptRunSeed {
  id: string;
  promptId: string;
  llmModelId: string;
  marketId: string;
  runAt: string;
  status: PromptRunStatus;
  rawResponse: string;
  rawMetadata: PromptRunMetadata;
}

export interface MentionSeed {
  id: string;
  promptRunId: string;
  brandId: string;
  isPresent: boolean;
  position: number | null;
  sentiment: Sentiment;
  sentimentScore: number;
}

export interface CitationSeed {
  id: string;
  promptRunId: string;
  brandId: string | null;
  domain: string;
  pageUrl: string;
  title: string;
  isOwnDomain: boolean;
}

export interface VisibilityScoreSeed {
  id: string;
  organizationId: string;
  brandId: string;
  marketId: string;
  llmModelId: string;
  weekStart: string;
  mentionsScore: number;
  citationsScore: number;
  positionScore: number;
  sentimentScore: number;
  totalScore: number;
}

export interface TrackedItemSeed {
  id: string;
  organizationId: string;
  itemType: "topic" | "prompt" | "source";
  itemRefId: string;
  brandId: string;
  categoryId: string;
  status: TrackedItemStatus;
  createdAt: string;
}

export interface AgenticTrafficLogSeed {
  id: string;
  domainId: string;
  userAgent: string;
  matchedBotName: string;
  requestPath: string;
  statusCode: number;
  requestedAt: string;
}

export interface ReferralTrafficEventSeed {
  id: string;
  domainId: string;
  sourceLlmModelId: string;
  landingPage: string;
  sessionId: string;
  occurredAt: string;
  orderId: string | null;
  revenueAmount: number | null;
}

// A dashboard filter range. Every range-aware query slices the snapshot
// table below instead of computing anything relative to "now" — see the
// comment on WeeklySnapshot for why.
export type DateRange = "1w" | "2w" | "4w";

export interface SparklinePoint {
  week: string;
  value: number;
}

export interface StatCard {
  id: string;
  label: string;
  /** Info-icon tooltip copy, confirmed per-metric in the Figma spec. */
  description: string;
  value: number;
  decimals?: number;
  trend: { direction: "up" | "down" | "flat"; percent: number };
  sparkline: SparklinePoint[];
}

export interface SentimentWeek {
  week: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface MarketComparisonRow {
  brand: string;
  isSelf: boolean;
  mentions: number;
  citations: number;
}

export interface TrafficWeek {
  week: string;
  agentic: number;
  referral: number;
}

export interface Opportunity {
  id: string;
  category: string;
  title: string;
}

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  /** Real page this step's action lives on. Omit when the feature behind
   *  this step isn't built yet — the step still shows, but clicking it
   *  surfaces a "준비 중" note instead of navigating (see
   *  docs/overview-checklists-plan.md groups A vs B). */
  href?: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  /** Modal subhead shown under the title when the card is opened. */
  description: string;
  completedSteps: number;
  totalSteps: number;
  steps: ChecklistStep[];
}

export interface ContentVisibility {
  visiblePercent: number;
  /** e.g. "낮음 — 대부분의 콘텐츠가 AI 모델에 노출되지 않음" */
  statusLabel: string;
  headline: string;
  detail: string;
  buttonLabel: string;
  buttonHref?: string;
  cta: { title: string; detail: string };
  /** Set when no real crawl exists yet — the gauge/percent aren't measured,
   *  so the card should prompt the user to set up a sitemap or run a crawl
   *  instead of showing a number that looks measured but isn't. */
  emptyReason?: "no_sitemap" | "not_crawled";
}

// A single week's pre-aggregated snapshot, captured every Sunday at 00:00.
// The real pipeline writes one of these rows per org per week instead of
// the dashboard recomputing metrics from raw events on every request — so
// the mock schema mirrors that: charts are built by slicing this array,
// never by measuring an offset from "today".
export interface WeeklySnapshot {
  /** ISO date the snapshot was captured at (Sunday 00:00). */
  capturedAt: string;
  /** Pre-formatted label used on chart x-axes, e.g. "Aug 30, 2026". */
  weekLabel: string;
  /** Point-in-time metrics: the latest snapshot's value, never summed. */
  pointInTime: {
    visibilityScore: number;
  };
  /** Additive metrics for the week: summed when a range spans multiple weeks. */
  cumulative: {
    brandMentions: number;
    citations: number;
    agenticInteractions: number;
    llmReferralTraffic: number;
  };
  sentiment: { positive: number; neutral: number; negative: number };
  market: MarketComparisonRow[];
  traffic: { agentic: number; referral: number };
}

// ---- Visibility Overview page ----

export interface RankedRow {
  label: string;
  value: number;
  display: string;
}

export interface TopicPromptRow {
  id: string;
  prompt: string;
  model: string;
  myBrand: string;
  brand: string;
  source: string;
  market: string;
  /** 이 실행이 수집된 시각(ISO) — 토픽 상세의 "수집 로그별 변화" 표에 씀. */
  runAt?: string;
}

// searchVolume/difficulty dropped for P0 (neodigm_p0_scope.md §2) — those
// numbers only exist behind a 3rd-party keyword API (Semrush etc.) we don't
// have. mentions/visibility stay: both are derived from our own prompt_runs.
export interface TopicRow {
  id: string;
  topic: string;
  mentions: number;
  visibility: number;
  market: string;
  prompts: TopicPromptRow[];
  /** "토픽 기회"에서 만든 콘텐츠가 이미 프롬프트 라이브러리에 추가됐는지. */
  addedToLibrary?: boolean;
  /** 이 토픽을 위해 만든 콘텐츠 페이지 — 사용자가 직접 입력(옵션). */
  targetUrl?: string;
  /** targetUrl이 실제로 AI 답변에 인용된 횟수 — 전체 수집 결과 기준 실측치. */
  targetUrlCitations?: number;
  /** 이 토픽이 처음 수집된 시점 — prompts 중 가장 이른 runAt. Overview의
   *  "최신 기회" 정렬 기준으로 쓴다. */
  createdAt?: string;
  /** LLM API 연동 전까지 "DB 등록" 모달로 사람이 채운 콘텐츠 생성 가이드. */
  guide?: string;
}

export interface TopicCategory {
  id: string;
  label: string;
  badge: number;
}

export interface BrandRankRow {
  id: string;
  brand: string;
  mentions: number;
}

export interface CitedPageRow {
  id: string;
  pageUrl: string;
  responses: number;
  market: string;
  myBrand: string;
}

// organicTraffic dropped for P0 — a domain-level SEO index (Semrush/Ahrefs)
// number, not something our own collection produces.
export interface CitedSourceRow {
  id: string;
  domain: string;
  market: string;
  myBrandMentions: number;
  citedPages: number;
  prompts: number;
  /** LLM이 이 소스를 어떻게 공략할지 제안한 액션 — LLM API 연동 전엔 수동으로 채운다. */
  recommendation?: string;
  reasoning?: string;
}

export type VisibilityTableRow = TopicRow | BrandRankRow | CitedPageRow | CitedSourceRow;

// ---- Prompt Research page ----

export type Relevancy = "낮음" | "중간" | "높음" | "Best";

// searchVolume dropped for P0 — no keyword-volume API. `relevancy` stays:
// it comes from an LLM relevance classification, not a keyword tool.
// One LLM-generated sub-prompt under a related topic. `promptCount` on the
// parent row is this array's length — the number of sub-prompts the LLM
// suggested for that topic, not a keyword-volume metric.
export interface RelatedTopicSubPrompt {
  id: string;
  prompt: string;
  model: string;
  aiResponseSummary: string;
  brandsMentioned: number;
  sourcesCited: number;
}

export interface RelatedTopicRow {
  id: string;
  topic: string;
  promptCount: number;
  relevancy: Relevancy;
  subPrompts: RelatedTopicSubPrompt[];
}

export interface BrandMentionRow {
  id: string;
  brand: string;
  mentions: number;
  sourceDomains: number;
  examplePrompt: string;
}

// organicTraffic dropped for P0 — same reason as CitedSourceRow above.
export interface SourceDomainRow {
  id: string;
  domain: string;
  mentions: number;
  sourceUrls: number;
  examplePrompt: string;
}

export interface PromptResearchResult {
  topic: string;
  stats: {
    uniqueTopics: number;
    uniquePrompts: number;
    uniqueBrands: number;
    uniqueSourceDomains: number;
  };
  intent: { informational: number; commercial: number; transactional: number };
  relatedTopics: RelatedTopicRow[];
  brands: BrandMentionRow[];
  sourceDomains: SourceDomainRow[];
}

// ---- Search Collection page ----
// P1로 연기 (검색결과 리서치 화면 삭제). 네이버 통합검색/구글 SERP 랭킹 수집은
// naver_search_results 테이블 설계가 필요한 별도 파이프라인이라 재도입 시 이
// 자리에 NaverBlockType/NaverSearchResultRow/GoogleSearchResultRow/
// SearchCollectionResult를 다시 정의하면 된다 (git 히스토리의 이전 버전 참고).

// ---- Search Trend page ----
// Naver DataLab 통합 검색어 트렌드 API 연동 전 화면 뼈대 (docs/naver-datalab-search-trend-plan.md
// §3 참고). 클라이언트 아이디/시크릿 발급 전이라 실제 API 호출은 없고, 이 타입에 맞는 mock
// 시계열만 채워둔 상태 — 실 연동 시 이 shape을 그대로 채우면 됨. `ratio`는 API 응답과 동일하게
// 절대값이 아닌 구간 내 상대값(0~100)이라는 점을 유지한다.
export interface SearchTrendPoint {
  period: string;
  ratio: number;
}

export interface SearchTrendSeries {
  id: string;
  groupName: string;
  keywords: string[];
  data: SearchTrendPoint[];
}

export interface SearchTrendResult {
  startDate: string;
  endDate: string;
  timeUnit: "date" | "week" | "month";
  series: SearchTrendSeries[];
}

// ---- Search Performance page (GSC) ----
// GSC Search Analytics API 연동 전 화면 뼈대 (docs/gsc-search-analytics-plan.md
// §3 참고). GscConnection이 "connected"인 브랜드에 한해 이 결과가 존재한다고
// 가정한 mock — 실 연동 시 searchanalytics.query 배치 결과를 그대로 채우면 된다.
export interface GscTrendWeek {
  week: string;
  clicks: number;
  impressions: number;
}

export interface GscTopQueryRow {
  id: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscDeviceRow {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
}

export interface GscCountryRow {
  country: string;
  clicks: number;
  impressions: number;
}

export interface GscSearchPerformanceResult {
  brandId: string;
  property: string;
  trend: GscTrendWeek[];
  topQueries: GscTopQueryRow[];
  /** device 차원 실적 — 콘텐츠 포맷(요약형 vs 긴 글) 우선순위 참고용. */
  devices?: GscDeviceRow[];
  /** country 차원 실적 — 마켓 확장 우선순위를 실측으로 뒷받침하는 근거. */
  countries?: GscCountryRow[];
}

// ---- GSC 추가 신호 (docs/gsc-additional-signals.md) ----

// URL Inspection API (urlInspection.index.inspect) — 우리 자체 크롤 기반
// 콘텐츠 가시성 점수와 별개로, 구글이 실제로 이 URL을 어떻게 보고 있는지.
// "인덱싱 자체가 안 됨" vs "인덱싱은 됐는데 크롤 가시성이 낮음" vs "다 되는데
// 안 뽑힘"을 구분하기 위한 근거로 쓴다.
export interface GscUrlIndexStatus {
  url: string;
  verdict: string;
  coverageState: string;
  robotsTxtState: string;
  indexingState: string;
  lastCrawlTime: string | null;
  pageFetchState: string;
  googleCanonical: string | null;
  userCanonical: string | null;
  sitemaps: string[];
  checkedAt: string;
}

// searchAnalytics.query의 searchAppearance 차원 — FAQ/사이트링크 같은 리치
// 결과 유형별 실적. "FAQ 추가" 기회 실행 후 실제로 리치 결과 노출이 생겼는지
// 검증하는 근거로 쓴다.
export interface GscSearchAppearanceRow {
  appearance: string;
  clicks: number;
  impressions: number;
}

// Sitemaps API (sitemaps.list) — 제출한 사이트맵별 구글 처리 현황.
export interface GscSitemapContentStat {
  type: string;
  submitted: number;
  indexed: number;
}

export interface GscSitemapStatus {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  warnings: number;
  errors: number;
  contents: GscSitemapContentStat[];
}

// PageSpeed Insights API(CrUX 실사용자 필드 데이터 + Lighthouse 랩 데이터) —
// GSC와 다른 API(API 키 인증)라 별도 타입으로 둔다. 페이지가 느리면 AI
// 크롤러도 렌더링 타임아웃으로 못 읽을 수 있어 "콘텐츠 가시성 회복" 진단의
// 보조 근거로 쓴다.
export interface PageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  /** Lighthouse 성능 점수 (0~100). */
  performanceScore: number | null;
  /** Largest Contentful Paint (ms) — 실사용자 CrUX 데이터. */
  lcpMs: number | null;
  /** Cumulative Layout Shift (0~1대) — 실사용자 CrUX 데이터. */
  cls: number | null;
  /** Interaction to Next Paint (ms) — 실사용자 CrUX 데이터. */
  inpMs: number | null;
  /** true면 아래 값들이 실사용자 CrUX 필드 데이터, false면 Lighthouse 실험실
   *  추정치(트래픽이 적어 CrUX 데이터가 없는 경우). */
  hasFieldData: boolean;
  checkedAt: string;
}

// ---- Prompt Library page ----

export interface PromptLibraryRow {
  id: string;
  prompt: string;
  origin: "manual" | "ai_generated" | "csv_import";
  category: string;
  subcategory: string;
  lastModifiedAt: string | null;
  lastModifiedBy: string | null;
}

// brandedRatio/topicIntentMatch come from our own classification of tracked
// prompts (LLM call over prompt text) — P0-safe. Agentic URL coverage and
// strategy recommendations both need data we don't have yet (crawler logs,
// keyword API) and are dropped per neodigm_p0_scope.md §2.
export interface PromptLibraryHealth {
  brandedRatio: number;
  brandedTarget: number;
  topicIntentMatchCount: number;
  topicIntentTotal: number;
}

// ---- Manage Connections page (GSC only for now — CDN/Commerce are P0-out) ----

// Keyed by brandId, not orgId — GSC is a per-brand-domain connection.
// Multiple brands each get their own row, not a single org-wide one.
export interface GscConnection {
  brandId: string;
  status: "connected" | "disconnected";
  accountEmail: string;
  property: string;
  lastSyncedAt: string;
  syncedQueries: number;
  syncedImpressions: number;
  syncedClicks: number;
}

// ---- Brand Presence page ----

// One point per week; brand names are dynamic keys holding that week's
// value for that brand (recharts wants one row per x-axis tick).
export interface BrandWeeklyPoint {
  week: string;
  [brand: string]: number | string;
}

export interface PromptMetricsPoint {
  week: string;
  totalPrompts: number;
  sentimentDetectedPrompts: number;
}

export interface SentimentMoverRow {
  id: string;
  prompt: string;
  source: string;
  topic: string;
  category: string;
  market: string;
  popularity: number;
  fromSentiment: Sentiment;
  toSentiment: Sentiment;
}

export interface DataInsightRow {
  id: string;
  topic: string;
  source: string;
  popularity: number;
  visibilityScore: number;
  mentions: number;
  sentiment: Sentiment;
  totalCitations: number;
  ownCitations: number;
}

export interface ShareOfVoiceRow {
  id: string;
  topic: string;
  popularity: number;
  mentions: number;
  rank: number;
  sharePercent: number;
  topBrands: { brand: string; share: number }[];
}

export interface BrandPresenceData {
  allCompetitors: string[];
  defaultSelectedCompetitors: string[];
  mentionsByWeek: BrandWeeklyPoint[];
  citationsByWeek: BrandWeeklyPoint[];
  sentimentByWeek: { week: string; positive: number; neutral: number; negative: number }[];
  promptMetricsByWeek: PromptMetricsPoint[];
  topMovers: SentimentMoverRow[];
  bottomMovers: SentimentMoverRow[];
  dataInsights: DataInsightRow[];
  shareOfVoice: ShareOfVoiceRow[];
}

// ---- Opportunity Detail — Template B (robots.txt diagnostic) ----

export interface RobotsTxtLine {
  lineNumber: number;
  text: string;
  blocksAgent: boolean;
}

export interface BlockedAgentRow {
  agent: string;
  blockedUrls: number;
  rule: string;
}

export interface RobotsTxtOpportunity {
  title: string;
  description: string;
  summary: string;
  totalUrls: number;
  blockedAgentsCount: number;
  sitemapUrl: string;
  lines: RobotsTxtLine[];
  blockedTraffic: BlockedAgentRow[];
}

// ---- Opportunity Detail — Template C (content recovery) ----

// No `traffic` column here on purpose — pageview counts need GA/CDN logs,
// which are P0-out (neodigm_p0_scope.md §2). `priorityScore` is derived
// from our own crawl (lower contentVisibility -> higher priority).
export interface ContentRecoveryUrl {
  id: string;
  url: string;
  status: "not_optimized" | "optimized";
  contentVisibility: number;
  priorityScore: number;
  /** 배포 없이 "다시 크롤링"만 반복해서 얻는 전/후 비교 — 이전 크롤의 같은 URL 값. */
  previousContentVisibility?: number;
  /** LLM API 연동 전까지 "DB 등록" 모달로 사람이 채운 수정 가이드. */
  guide?: string;
  /** URL Inspection API로 확인한 구글 실제 인덱싱 상태 — 우리 크롤 가시성
   *  점수와 별개로, "애초에 구글이 안 읽는지"를 구분하는 근거. */
  googleIndex?: GscUrlIndexStatus;
  /** PageSpeed Insights(CrUX 실사용자 데이터) 결과. */
  pageSpeed?: PageSpeedResult;
}

export interface ContentRecoveryOpportunity {
  title: string;
  /** 이 기회가 처음 발견된 시점 — 최초 크롤(baseline)의 crawledAt. Overview의
   *  "최신 기회" 정렬 기준으로 쓴다. */
  createdAt: string;
  affectedUrls: number;
  expectedVisibilityMultiplier: number;
  averageContentVisibility: number;
  description: string;
  optimizedCount: number;
  totalCount: number;
  urls: ContentRecoveryUrl[];
  /** 배포 전/후 비교 — 실 크롤 기록이 2회 이상 쌓였을 때만 채워진다. */
  comparison?: {
    baselineCrawledAt: string;
    baselineAverageContentVisibility: number;
    latestCrawledAt: string;
    latestAverageContentVisibility: number;
    improvementPercent: number;
  };
}

// ---- Opportunity Detail — 온사이트 콘텐츠 최적화(가독성/FAQ/목차/멀티미디어) ----
// ContentRecoveryOpportunity와 구조는 같지만 지표 이름이 고정돼있지 않은
// 범용 버전 — crawl-sitemap.mjs가 한 번의 크롤로 raw HTML/렌더링 결과에서
// 여러 지표(복잡도, FAQ, 목차, 이미지 alt)를 동시에 계산해두므로, 지표별로
// 이 하나의 모양을 재사용한다.
export interface ContentAuditUrl {
  id: string;
  url: string;
  status: "not_optimized" | "optimized" | "excluded";
  score: number;
  priorityScore: number;
  previousScore?: number;
  /** LLM API 연동 전까지 "DB 등록" 모달로 사람이 채운 수정 가이드. */
  guide?: string;
  /** URL Inspection API로 확인한 구글 실제 인덱싱 상태. */
  googleIndex?: GscUrlIndexStatus;
  /** PageSpeed Insights(CrUX 실사용자 데이터) 결과. */
  pageSpeed?: PageSpeedResult;
}

export interface ContentAuditOpportunity {
  /** "complexity" | "faq" | "toc" | "multimedia" — 제외 저장소를 구분하는 키. */
  metricKey: string;
  title: string;
  /** 이 기회가 처음 발견된 시점 — 최초 크롤(baseline)의 crawledAt. Overview의
   *  "최신 기회" 정렬 기준으로 쓴다. */
  createdAt: string;
  metricLabel: string;
  unit: "%" | "pt";
  description: string;
  affectedUrls: number;
  averageScore: number;
  optimizedCount: number;
  excludedCount: number;
  totalCount: number;
  urls: ContentAuditUrl[];
  comparison?: {
    baselineCrawledAt: string;
    baselineAverageScore: number;
    latestCrawledAt: string;
    latestAverageScore: number;
    improvementPercent: number;
  };
}

// ---- URL Inspector page ----
// "인용 시도"(citation attempts)/"LLM 레퍼럴 유입 수" charts and the
// "도메인 강도" column are dropped for P0 — they need CDN logs, referral
// analytics, or a domain-authority index, none of which we have
// (neodigm_p0_scope.md §2). Everything below comes from our own citations.

export interface OwnCitedUrlRow {
  id: string;
  url: string;
  citations: number;
  citedPrompts: number;
  /** null when there's no real source for this yet (실 인용 집계엔 없고 사이트맵 크롤과 별도 매칭이 필요) */
  contentVisibility: number | null;
  category: string;
  market: string;
}

export interface ThirdPartyUrlRow {
  id: string;
  url: string;
  contentType: string;
  citations: number;
  citedPrompts: number;
  category: string;
  market: string;
}

export interface CitedDomainRow {
  id: string;
  domain: string;
  citations: number;
  uniqueUrls: number;
  citationsPerUrl: number;
  citedPrompts: number;
  contentType: string;
}

export interface UrlInspectorData {
  ownCitedPrompts: number;
  totalCitedPrompts: number;
  uniqueCitedUrls: number;
  totalCitations: number;
  ownUrls: OwnCitedUrlRow[];
  thirdPartyUrls: ThirdPartyUrlRow[];
  citedDomains: CitedDomainRow[];
}

// ---- Brands Management page (Settings > 브랜드 관리) ----
// Pure CRUD over our own org's tracked brands/categories — no 3rd-party
// data involved, fully P0.

export interface SocialAccount {
  platform: string;
  handle: string;
}

export interface ManagedBrand {
  id: string;
  name: string;
  url: string;
  /** Sitemap XML URL — drives the real content-visibility crawler (scripts/crawl-sitemap.mjs). */
  sitemapUrl: string;
  description: string;
  industry: string;
  markets: string[];
  status: BrandStatus;
  aliases: string[];
  otherBrands: string[];
  urls: string[];
  socialAccounts: SocialAccount[];
  earnedContentSources: string[];
  cdnConnected: boolean;
  gscConnected: boolean;
  analyticsConnected: boolean;
}

// ---- Sitemap crawler (content-visibility: raw vs rendered HTML) ----
// Real crawl, no mock: scripts/crawl-sitemap.mjs fetches a brand's sitemap,
// then for each page compares raw (pre-JS) HTML text against Playwright-
// rendered text — the same raw-vs-rendered technique described for content
// recovery (see opportunities.ts). A low contentVisibility % means most of
// the page's text only exists after JS runs, which AI crawlers often skip.
export interface SitemapCrawlUrlResult {
  url: string;
  status: "success" | "failed";
  rawTextLength: number;
  renderedTextLength: number;
  contentVisibility: number;
  /** 0~100, 높을수록 읽기 쉬움 — 평균 문장/단어 길이 기반 단순 휴리스틱. */
  complexityScore?: number;
  /** FAQ 스키마/텍스트 패턴 탐지 결과. */
  hasFaq?: boolean;
  /** 목차(같은 페이지 앵커 링크 다수) 탐지 결과. */
  hasToc?: boolean;
  /** alt 속성이 채워진 <img> 비율(0~100%). */
  imageAltCoverage?: number;
  error: string | null;
}

export interface SitemapCrawlResult {
  domain: string;
  sitemapUrl: string;
  crawledAt: string;
  urls: SitemapCrawlUrlResult[];
}

export interface ManagedCategory {
  id: string;
  name: string;
  promptCount: number;
  origin: "system" | "user";
}

export interface BrandsManagementData {
  brands: ManagedBrand[];
  categories: ManagedCategory[];
}

// ---- Prompt Strategy page ----
// Two P0 sources only (neodigm_p0_scope.md §1/§2): GSC (real impressions on
// our own property) and a weekly LLM "insight brainstorm" batch seeded with
// our current mentions/citations — Semrush and synthetic personas (the
// original design's other two sources) are dropped. Both sources land in
// this exact shape so the future batch job can write into it unchanged.

export type StrategySource = "gsc" | "llm_brainstorm" | "citation_attempt";

export interface PromptStrategySuggestion {
  id: string;
  tag: "coverage_gap" | "strength";
  source: StrategySource;
  title: string;
  summary: string;
  stat: string;
  /** source === "gsc"인 실측 키워드 공백 그룹에서만 채워지는 원본 GSC 검색어 —
   *  이 키워드로 LLM에게 자연어 프롬프트를 만들어달라고 물어볼 때 쓴다. */
  gscKeyword?: string;
  /** searchAnalytics.query를 ["query","page"] 결합 차원으로 조회해 찾은,
   *  이 검색어로 이미 노출되고 있는 우리 페이지 — 있으면 타겟 URL 추천 근거로 쓴다. */
  gscTopPage?: string;
  /** source === "citation_attempt"인 실측 그룹에서만 채워지는 타겟 URL(노출은
   *  많은데 클릭이 적은 우리 페이지) — 이 URL로 LLM에게 인용 테스트용
   *  자연어 질문을 만들어달라고 물어볼 때 쓴다. */
  citationTestUrl?: string;
}

export interface StrategyBrandMention {
  brand: string;
  mentions: number;
  isOwnBrand: boolean;
}

// LLM 브레인스토밍 마법사(3단계 DB 등록 모달)의 최종 저장 스키마 — LLM은
// 서술(tag/title/summary/stat)과 "어떤 실측 토픽을 근거로 들지"만 정하고,
// brandMentions 같은 숫자는 절대 LLM 응답에서 가져오지 않는다. 저장 시
// topics에 적힌 문자열로 실측 데이터(getRealTopicBrandMentions)를 다시
// 조회해서 채운다 — 이미 수집된 토픽이 아니면 "미수집" 상태로 남는다.
export interface LlmBrainstormCard {
  id: string;
  tag: "coverage_gap" | "strength";
  title: string;
  summary: string;
  stat: string;
  /** LLM이 이 카드의 근거로 인용한 실측 토픽 문자열 목록. */
  topics: string[];
}

export interface PromptStrategyTopicRow {
  id: string;
  topic: string;
  market: string;
  source: StrategySource;
  gscImpressions: number | null;
  brandMentions: StrategyBrandMention[];
  /** Groups this topic under a PromptStrategySuggestion card (same id). */
  groupId?: string;
  /** 검색 의도(예: Planning/Informational/Transactional) — LLM이 프롬프트 문장을 만들 때 함께 분류한 값. */
  intent?: string;
  /** 이 프롬프트 문장 자체가 브랜드명을 직접 언급하는지 여부. */
  branded?: boolean;
  /** 왜 이 프롬프트를 추천하는지에 대한 짧은 근거. */
  reasoning?: string;
  /** GSC 커버리지 공백 행(source==="gsc")에서만 채워지는, 이 검색어로 이미
   *  노출되고 있는 우리 페이지 — ["query","page"] 결합 조회로 찾는다. */
  gscTopPage?: string;
}

export interface PromptStrategyData {
  suggestions: PromptStrategySuggestion[];
  topics: PromptStrategyTopicRow[];
}

// 사용자가 실 GSC 키워드를 LLM(ChatGPT 등)에 직접 물어봐서 얻은 실제 프롬프트
// 문장. LLM API가 아직 연동되지 않아 수동으로 붙여넣는 다리 역할 — 나중에
// 실 스케줄러가 붙으면 이 값을 자동으로 채우도록 같은 모양을 유지한다.
export interface GscCraftedPrompt {
  prompt: string;
  market?: string;
  brandMentions?: StrategyBrandMention[];
  intent?: string;
  branded?: boolean;
  reasoning?: string;
}

// ---- 도움말 및 학습 페이지 ----

// 데모/쇼케이스에서 "이건 지금 안 되지만, X를 연결하면 이렇게 확장됩니다"를
// 설명하기 위한 내부용 로드맵 — 실제 기능 화면에는 이런 상태 설명을 절대
// 노출하지 않는다는 원칙과 별개로, 이 페이지 자체가 그 설명을 위한 곳이라
// 여기서는 명시적으로 다룬다.
export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
}

export interface RoadmapGroup {
  id: string;
  /** 이 그룹의 기능들이 열리는 조건, 예: "LLM API 연동 시". */
  trigger: string;
  description: string;
  items: RoadmapItem[];
}

// 실 유저가 소비하는 도움말 콘텐츠 — 카드 목록에서 고르면 상세 설명으로
// 이동한다.
export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  /** 카드 목록에 보이는 한 줄 요약. */
  summary: string;
  /** 상세 페이지 본문 — 문단 단위 배열. */
  content: string[];
  /** 상세 페이지에 함께 보여줄 핵심 포인트 목록(옵션). */
  highlights?: string[];
  relatedHref?: string;
  relatedLabel?: string;
}
