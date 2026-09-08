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

// Naver has two distinct surfaces per project_naver_p0 memory: an AI-chat
// surface (reuses the prompt_runs/mentions/citations pipeline, so it lives
// under Prompt Research's model dropdown) and this traditional ranked
// integrated-search surface, which needs its own naver_search_results
// (keyword, block_type, rank, url, snippet) table + adapter. Google is the
// same ranked shape, just a different provider/block taxonomy.
export type NaverBlockType = "블로그" | "카페" | "파워링크" | "쇼핑" | "지식iN";

export interface NaverSearchResultRow {
  id: string;
  rank: number;
  blockType: NaverBlockType;
  title: string;
  url: string;
  snippet: string;
  isOwnBrand: boolean;
  /** ISO timestamp of the collection run that produced this row. */
  collectedAt: string;
}

export interface GoogleSearchResultRow {
  id: string;
  rank: number;
  title: string;
  url: string;
  snippet: string;
  isAiOverview: boolean;
  isOwnBrand: boolean;
  /** ISO timestamp of the collection run that produced this row. */
  collectedAt: string;
}

export interface SearchCollectionResult {
  keyword: string;
  stats: {
    collectedBlocks: number;
    rankedUrls: number;
    ownBrandRanks: number;
    competitorRanks: number;
  };
  naver: NaverSearchResultRow[];
  google: GoogleSearchResultRow[];
}

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

export interface GscSearchPerformanceResult {
  brandId: string;
  property: string;
  trend: GscTrendWeek[];
  topQueries: GscTopQueryRow[];
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
}

export interface ContentRecoveryOpportunity {
  title: string;
  affectedUrls: number;
  expectedVisibilityMultiplier: number;
  averageContentVisibility: number;
  description: string;
  optimizedCount: number;
  totalCount: number;
  urls: ContentRecoveryUrl[];
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
  contentVisibility: number;
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

export type StrategySource = "gsc" | "llm_brainstorm";

export interface PromptStrategySuggestion {
  id: string;
  tag: "coverage_gap" | "strength";
  source: StrategySource;
  title: string;
  summary: string;
  stat: string;
}

export interface StrategyBrandMention {
  brand: string;
  mentions: number;
  isOwnBrand: boolean;
}

export interface PromptStrategyTopicRow {
  id: string;
  topic: string;
  market: string;
  source: StrategySource;
  gscImpressions: number | null;
  brandMentions: StrategyBrandMention[];
}

export interface PromptStrategyData {
  suggestions: PromptStrategySuggestion[];
  topics: PromptStrategyTopicRow[];
}
