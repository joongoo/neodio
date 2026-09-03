import { organizations } from "./data/organizations";
import { brandPresenceByOrg } from "./data/brandPresence";
import { brandsManagementByOrg } from "./data/brandsManagement";
import { contentRecoveryOpportunityByOrg, robotsTxtOpportunityByOrg } from "./data/opportunities";
import { gscConnectionByBrand } from "./data/connections";
import { promptLibraryByOrg, promptLibraryHealthByOrg } from "./data/promptLibrary";
import { promptResearchByTopic } from "./data/promptResearch";
import { promptStrategyByOrg } from "./data/promptStrategy";
import { urlInspectorByOrg } from "./data/urlInspector";
import {
  checklistByOrg,
  contentVisibilityByOrg,
  opportunitiesByOrg,
  snapshotsByOrg,
} from "./data/overview";
import {
  mentionsByMarketByOrg,
  mentionsByModelByOrg,
  topicCategoriesByOrg,
  topicsByOrgAndCategory,
} from "./data/visibilityOverview";
import {
  seedAgenticTrafficLogs,
  seedBrands,
  seedCategories,
  seedCitations,
  seedDomains,
  seedLlmModels,
  seedMarkets,
  seedMentions,
  seedPromptRuns,
  seedPrompts,
  seedReferralTrafficEvents,
  seedTopics,
  seedTrackedItems,
  seedVisibilityScores,
} from "./data/seed";
import { DateRange, Organization, StatCard, WeeklySnapshot } from "./types";

// Mock DB client. Every export is async and returns plain data, exactly like
// a real query would (Prisma/Drizzle call, REST fetch, etc). Pages should
// only ever import from here — never reach into src/lib/db/data directly —
// so the dummy tables can be swapped for a real database later without
// touching any page or component.

async function findOrg(orgId: string): Promise<Organization> {
  const org = organizations.find((o) => o.id === orgId);
  if (!org) throw new Error(`Unknown organization: ${orgId}`);
  return org;
}

const RANGE_WEEKS: Record<DateRange, number> = { "1w": 1, "2w": 2, "4w": 4 };

// Confirmed tooltip copy per metric (Figma node 713:11010).
const STAT_DESCRIPTIONS: Record<string, string> = {
  "visibility-score":
    "브랜드 가시성의 가중 평균 지표예요. 주간 실행 기준으로 언급(35%)·인용(15%)·포지션(30%)·감성(20%)을 가중합산해요. 점수가 높을수록 가시성이 강하고 브랜드 임팩트가 일관적이라는 뜻이에요.",
  "brand-mentions":
    "선택한 전체 기간 동안 브랜드를 언급한 고유 프롬프트 수예요. 그래프는 주별 언급 프롬프트 수를 보여줘요.",
  citations:
    "선택한 전체 기간 동안 브랜드를 인용한 고유 프롬프트 수예요. 그래프는 주별 인용 프롬프트 수를 보여줘요.",
  "agentic-interactions":
    "AI 에이전트가 웹사이트에 보낸 총 요청 수예요. AI 챗봇을 비롯한 비인간(non-human) 에이전트 트래픽을 포함해요.",
  "llm-referral-traffic":
    "AI가 생성한 답변 속 인용 링크를 클릭해 유입된 실제 사용자(휴먼) 트래픽이에요.",
};

// The snapshot table is the only thing every range-aware query touches.
// Charts are built by slicing it — nothing here measures an offset from
// "now"; the range only ever selects which already-captured weekly rows
// to read, which is what makes this fast against a real weekly-snapshot
// pipeline (no on-the-fly aggregation over raw events).
function getSnapshots(orgId: string, range: DateRange): WeeklySnapshot[] {
  const all = snapshotsByOrg[orgId] ?? [];
  return all.slice(-RANGE_WEEKS[range]);
}

function trend(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) {
    return { direction: "flat" as const, percent: 0 };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    direction: percent === 0 ? ("flat" as const) : percent > 0 ? ("up" as const) : ("down" as const),
    percent: Math.abs(percent),
  };
}

async function getStatCards(orgId: string, range: DateRange = "4w"): Promise<StatCard[]> {
  const all = snapshotsByOrg[orgId] ?? [];
  const inRange = getSnapshots(orgId, range);
  const latest = inRange[inRange.length - 1];
  if (!latest) return [];

  // Sparkline mirrors the selected range, same weeks as the big charts —
  // a 1-week filter shows a single bar, 4 weeks shows all four.
  const toSparkline = (pick: (s: WeeklySnapshot) => number) =>
    inRange.map((s) => ({ week: s.weekLabel, value: pick(s) }));

  // Previous period = the same number of weeks immediately before the
  // selected range, so "vs last period" stays meaningful at any range.
  const windowSize = RANGE_WEEKS[range];
  const previousWindow = all.slice(-windowSize * 2, -windowSize);
  const sum = (snaps: WeeklySnapshot[], pick: (s: WeeklySnapshot) => number) =>
    snaps.reduce((total, s) => total + pick(s), 0);

  const visibilityPrev = all[all.indexOf(latest) - 1]?.pointInTime.visibilityScore;

  return [
    {
      id: "visibility-score",
      label: "가시성 점수",
      description: STAT_DESCRIPTIONS["visibility-score"],
      value: latest.pointInTime.visibilityScore,
      decimals: 1,
      trend: trend(latest.pointInTime.visibilityScore, visibilityPrev),
      sparkline: toSparkline((s) => s.pointInTime.visibilityScore),
    },
    {
      id: "brand-mentions",
      label: "브랜드 언급",
      description: STAT_DESCRIPTIONS["brand-mentions"],
      value: sum(inRange, (s) => s.cumulative.brandMentions),
      trend: trend(
        sum(inRange, (s) => s.cumulative.brandMentions),
        sum(previousWindow, (s) => s.cumulative.brandMentions)
      ),
      sparkline: toSparkline((s) => s.cumulative.brandMentions),
    },
    {
      id: "citations",
      label: "인용 수",
      description: STAT_DESCRIPTIONS["citations"],
      value: sum(inRange, (s) => s.cumulative.citations),
      trend: trend(
        sum(inRange, (s) => s.cumulative.citations),
        sum(previousWindow, (s) => s.cumulative.citations)
      ),
      sparkline: toSparkline((s) => s.cumulative.citations),
    },
    {
      id: "agentic-interactions",
      label: "에이전틱 상호작용",
      description: STAT_DESCRIPTIONS["agentic-interactions"],
      value: sum(inRange, (s) => s.cumulative.agenticInteractions),
      trend: trend(
        sum(inRange, (s) => s.cumulative.agenticInteractions),
        sum(previousWindow, (s) => s.cumulative.agenticInteractions)
      ),
      sparkline: toSparkline((s) => s.cumulative.agenticInteractions),
    },
    {
      id: "llm-referral-traffic",
      label: "LLM 리퍼럴 트래픽",
      description: STAT_DESCRIPTIONS["llm-referral-traffic"],
      value: sum(inRange, (s) => s.cumulative.llmReferralTraffic),
      trend: trend(
        sum(inRange, (s) => s.cumulative.llmReferralTraffic),
        sum(previousWindow, (s) => s.cumulative.llmReferralTraffic)
      ),
      sparkline: toSparkline((s) => s.cumulative.llmReferralTraffic),
    },
  ];
}

export const db = {
  organizations: {
    get: findOrg,
    list: async () => organizations,
  },
  overview: {
    getStatCards,
    getContentVisibility: async (orgId: string) => contentVisibilityByOrg[orgId] ?? null,
    getChecklist: async (orgId: string) => checklistByOrg[orgId] ?? [],
    getSentiment: async (orgId: string, range: DateRange = "4w") =>
      getSnapshots(orgId, range).map((s) => ({ week: s.weekLabel, ...s.sentiment })),
    getMarketComparison: async (orgId: string, range: DateRange = "4w") => {
      const inRange = getSnapshots(orgId, range);
      const byBrand = new Map<string, { brand: string; isSelf: boolean; mentions: number; citations: number }>();
      for (const snap of inRange) {
        for (const row of snap.market) {
          const existing = byBrand.get(row.brand);
          if (existing) {
            existing.mentions += row.mentions;
            existing.citations += row.citations;
          } else {
            byBrand.set(row.brand, { ...row });
          }
        }
      }
      return Array.from(byBrand.values()).sort(
        (a, b) => b.mentions + b.citations - (a.mentions + a.citations)
      );
    },
    getTrafficTrends: async (orgId: string, range: DateRange = "4w") =>
      getSnapshots(orgId, range).map((s) => ({ week: s.weekLabel, ...s.traffic })),
    getOpportunities: async (orgId: string) => opportunitiesByOrg[orgId] ?? [],
  },
  visibilityOverview: {
    // Reuses the same snapshot-derived stat cards as the Overview page.
    // P0-safe subset only (neodigm_p0_scope.md §2): agentic interactions
    // and LLM referral traffic both need CDN/analytics logs we don't have,
    // so they're dropped here even though Overview still shows them.
    getStatCards: async (orgId: string, range: DateRange = "4w") =>
      (await getStatCards(orgId, range)).filter((stat) =>
        ["visibility-score", "brand-mentions", "citations"].includes(stat.id)
      ),
    getTopicCategories: async (orgId: string) => topicCategoriesByOrg[orgId] ?? [],
    getMentionsByModel: async (orgId: string) => mentionsByModelByOrg[orgId] ?? {},
    getMentionsByMarket: async (orgId: string) => mentionsByMarketByOrg[orgId] ?? {},
    getTopics: async (orgId: string, categoryId: string) =>
      topicsByOrgAndCategory[orgId]?.[categoryId] ?? [],
  },
  promptResearch: {
    // Single lookup for now (matches the /prompt-research API contract in
    // neodigm_screens_documentation.md §3 — one call returns everything the
    // screen needs). Unknown topics resolve to null → empty state.
    search: async (topic: string) => promptResearchByTopic[topic.trim()] ?? null,
  },
  promptStrategy: {
    get: async (orgId: string) => promptStrategyByOrg[orgId] ?? null,
  },
  promptLibrary: {
    list: async (orgId: string) => promptLibraryByOrg[orgId] ?? [],
    getHealth: async (orgId: string) => promptLibraryHealthByOrg[orgId] ?? null,
  },
  connections: {
    getGsc: async (brandId: string) => gscConnectionByBrand[brandId] ?? null,
  },
  brandsManagement: {
    get: async (orgId: string) => brandsManagementByOrg[orgId] ?? null,
    getBrand: async (orgId: string, brandId: string) =>
      brandsManagementByOrg[orgId]?.brands.find((b) => b.id === brandId) ?? null,
  },
  urlInspector: {
    get: async (orgId: string) => urlInspectorByOrg[orgId] ?? null,
  },
  opportunities: {
    getRobotsTxt: async (orgId: string) => robotsTxtOpportunityByOrg[orgId] ?? null,
    getContentRecovery: async (orgId: string) => contentRecoveryOpportunityByOrg[orgId] ?? null,
  },
  brandPresence: {
    // Reuses the same P0-safe stat cards as Visibility Overview.
    getStatCards: async (orgId: string, range: DateRange = "4w") =>
      (await getStatCards(orgId, range)).filter((stat) =>
        ["visibility-score", "brand-mentions", "citations"].includes(stat.id)
      ),
    get: async (orgId: string) => brandPresenceByOrg[orgId] ?? null,
  },
  seed: {
    brands: async () => seedBrands,
    categories: async () => seedCategories,
    citations: async () => seedCitations,
    domains: async () => seedDomains,
    llmModels: async () => seedLlmModels,
    markets: async () => seedMarkets,
    mentions: async () => seedMentions,
    promptRuns: async () => seedPromptRuns,
    prompts: async () => seedPrompts,
    referralTrafficEvents: async () => seedReferralTrafficEvents,
    topics: async () => seedTopics,
    trackedItems: async () => seedTrackedItems,
    agenticTrafficLogs: async () => seedAgenticTrafficLogs,
    visibilityScores: async () => seedVisibilityScores,
  },
};

export const DEFAULT_ORG_ID = "neodigm";

export * from "./types";
