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
  source: "seed" | "naver-ai-search" | "api" | "headless-browser";
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
  cta: { title: string; detail: string };
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

export interface TopicRow {
  id: string;
  topic: string;
  searchVolume: number;
  mentions: number;
  visibility: number;
  difficulty: number;
  market: string;
  prompts: TopicPromptRow[];
}

export interface TopicCategory {
  id: string;
  label: string;
  badge: number;
}
