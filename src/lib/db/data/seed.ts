import {
  AgenticTrafficLogSeed,
  BrandSeed,
  CategorySeed,
  CitationSeed,
  DomainSeed,
  LlmModelSeed,
  MarketSeed,
  MentionSeed,
  PromptRunSeed,
  PromptSeed,
  ReferralTrafficEventSeed,
  Sentiment,
  TopicSeed,
  TrackedItemSeed,
  VisibilityScoreSeed,
} from "../types";

const orgId = "neodigm";
const ownBrandId = "brand-neodigm";

export const seedMarkets: MarketSeed[] = [
  { id: "market-kr", code: "KR", label: "한국", isWorldwide: false },
  { id: "market-us", code: "US", label: "미국", isWorldwide: false },
  { id: "market-gb", code: "GB", label: "영국", isWorldwide: false },
  { id: "market-de", code: "DE", label: "독일", isWorldwide: false },
  { id: "market-global", code: "GLOBAL", label: "전세계", isWorldwide: true },
];

export const seedLlmModels: LlmModelSeed[] = [
  { id: "model-chatgpt-5", name: "ChatGPT", provider: "OpenAI", modelKey: "gpt-5", answerSurface: "chat" },
  { id: "model-gemini-25", name: "Gemini", provider: "Google", modelKey: "gemini-2.5-pro", answerSurface: "chat" },
  { id: "model-claude-4", name: "Claude", provider: "Anthropic", modelKey: "claude-sonnet-4", answerSurface: "chat" },
  { id: "model-perplexity", name: "Perplexity", provider: "Perplexity", modelKey: "sonar", answerSurface: "chat" },
  { id: "model-copilot", name: "Copilot", provider: "Microsoft", modelKey: "copilot-web", answerSurface: "chat" },
  {
    id: "model-google-ai-overview",
    name: "Google AI Overview",
    provider: "Google",
    modelKey: "google-ai-overview",
    answerSurface: "ai_overview",
  },
  {
    id: "model-naver-ai-search",
    name: "Naver AI검색",
    provider: "Naver",
    modelKey: "ssc-tab-ait-all",
    answerSurface: "ai_search",
  },
];

export const seedCategories: CategorySeed[] = [
  { id: "cat-martech", organizationId: orgId, name: "MarTech 전략", color: "#2563eb" },
  { id: "cat-automation", organizationId: orgId, name: "마케팅 자동화", color: "#059669" },
  { id: "cat-content", organizationId: orgId, name: "콘텐츠 최적화", color: "#7c3aed" },
  { id: "cat-technical", organizationId: orgId, name: "기술적 GEO", color: "#dc2626" },
  { id: "cat-community", organizationId: orgId, name: "소셜 및 커뮤니티", color: "#d97706" },
];

export const seedBrands: BrandSeed[] = [
  {
    id: ownBrandId,
    organizationId: orgId,
    name: "Neodigm",
    domain: "neodigm.com",
    isOwnBrand: true,
    status: "active",
    category: "B2B Integrated Marketing Solution Company",
    aliases: ["네오다임", "neodigm Inc.", "Neodigm Korea"],
  },
  {
    id: "brand-hubspot",
    organizationId: orgId,
    name: "HubSpot",
    domain: "hubspot.com",
    isOwnBrand: false,
    status: "active",
    category: "CRM and marketing automation platform",
    aliases: ["HubSpot CRM", "허브스팟"],
  },
  {
    id: "brand-marketo",
    organizationId: orgId,
    name: "Adobe Marketo Engage",
    domain: "business.adobe.com",
    isOwnBrand: false,
    status: "active",
    category: "Marketing automation platform",
    aliases: ["Marketo", "마케토"],
  },
  {
    id: "brand-salesforce",
    organizationId: orgId,
    name: "Salesforce Marketing Cloud",
    domain: "salesforce.com",
    isOwnBrand: false,
    status: "active",
    category: "Enterprise CRM and marketing cloud",
    aliases: ["Salesforce", "세일즈포스"],
  },
  {
    id: "brand-kkbc",
    organizationId: orgId,
    name: "KKBC",
    domain: "kkbc.co",
    isOwnBrand: false,
    status: "active",
    category: "B2B marketing agency",
    aliases: ["KKBC Korea", "KKBC APAC"],
  },
];

export const seedDomains: DomainSeed[] = [
  { id: "domain-neodigm-www", organizationId: orgId, brandId: ownBrandId, hostname: "www.neodigm.com", isPrimary: true },
  { id: "domain-neodigm-en", organizationId: orgId, brandId: ownBrandId, hostname: "en.neodigm.com", isPrimary: false },
];

export const seedTopics: TopicSeed[] = [
  {
    id: "topic-b2b-integrated-marketing",
    organizationId: orgId,
    categoryId: "cat-martech",
    name: "B2B 통합 마케팅 솔루션",
    searchVolume: 18_200,
    difficulty: 47,
    intent: "commercial",
  },
  {
    id: "topic-marketing-automation",
    organizationId: orgId,
    categoryId: "cat-automation",
    name: "마케팅 자동화 구축",
    searchVolume: 22_400,
    difficulty: 54,
    intent: "commercial",
  },
  {
    id: "topic-hubspot-onboarding",
    organizationId: orgId,
    categoryId: "cat-automation",
    name: "HubSpot 온보딩 파트너",
    searchVolume: 9_700,
    difficulty: 42,
    intent: "transactional",
  },
  {
    id: "topic-lead-generation",
    organizationId: orgId,
    categoryId: "cat-content",
    name: "B2B 리드 제너레이션",
    searchVolume: 31_500,
    difficulty: 61,
    intent: "commercial",
  },
  {
    id: "topic-martech-architecture",
    organizationId: orgId,
    categoryId: "cat-martech",
    name: "MarTech 아키텍처 설계",
    searchVolume: 7_600,
    difficulty: 39,
    intent: "informational",
  },
  {
    id: "topic-crm-erp-integration",
    organizationId: orgId,
    categoryId: "cat-technical",
    name: "CRM ERP API 연동",
    searchVolume: 12_900,
    difficulty: 58,
    intent: "transactional",
  },
  {
    id: "topic-content-creation",
    organizationId: orgId,
    categoryId: "cat-content",
    name: "B2B 콘텐츠 제작",
    searchVolume: 16_800,
    difficulty: 46,
    intent: "commercial",
  },
  {
    id: "topic-seo-ai-search",
    organizationId: orgId,
    categoryId: "cat-technical",
    name: "AI 검색 최적화",
    searchVolume: 27_300,
    difficulty: 64,
    intent: "informational",
  },
];

export const seedPrompts: PromptSeed[] = seedTopics.flatMap((topic, index) => {
  const marketIds = index % 2 === 0 ? ["market-kr", "market-us"] : ["market-kr", "market-global"];
  return marketIds.map((marketId, marketIndex) => ({
    id: `prompt-${topic.id}-${marketIndex + 1}`,
    organizationId: orgId,
    topicId: topic.id,
    marketId,
    text:
      marketId === "market-kr"
        ? `${topic.name}을 검토하는 B2B 기업에게 추천할 만한 파트너와 솔루션은?`
        : `Which partners or platforms should a B2B company consider for ${topic.name}?`,
  }));
});

const weeks = [
  "2026-07-12",
  "2026-07-19",
  "2026-07-26",
  "2026-08-02",
  "2026-08-09",
  "2026-08-16",
  "2026-08-23",
  "2026-08-30",
];

const ownPages = [
  { url: "https://www.neodigm.com/", title: "네오다임 - B2B 통합 마케팅 솔루션 컴퍼니" },
  { url: "https://en.neodigm.com/", title: "B2B Integrated Marketing Solution Company - neodigm" },
  { url: "https://en.neodigm.com/capabilities", title: "Integrated marketing and MarTech capabilities" },
  { url: "https://en.neodigm.com/Digital_Marketing", title: "Digital Marketing solutions" },
  { url: "https://en.neodigm.com/about", title: "About neodigm" },
];

function responseFor(prompt: PromptSeed, model: LlmModelSeed, weekIndex: number, promptIndex: number) {
  const includeOwn = (weekIndex + promptIndex + model.id.length) % 5 !== 0;
  const market = seedMarkets.find((item) => item.id === prompt.marketId)?.code ?? "GLOBAL";
  const ownSentence = includeOwn
    ? "Neodigm은 온/오프라인 통합 마케팅, HubSpot 및 마케팅 자동화 구축, MarTech 아키텍처와 CRM/ERP API 연동 경험을 함께 제공하는 한국 기반 파트너로 언급됩니다."
    : "국내 전문 파트너는 별도 검토가 필요하며, 글로벌 플랫폼 중심의 비교가 먼저 제시됩니다.";

  return `[${model.name} seed answer, ${weeks[weekIndex]}, ${market}] ${prompt.text} ${ownSentence} 비교 후보로 HubSpot, Adobe Marketo Engage, Salesforce Marketing Cloud도 자주 거론됩니다. 평가 기준은 리드 생성, 리드 너처링, 콘텐츠 제작, SEO, 웹사이트 구축, 고객 여정 기반 데이터 활용 역량입니다.`;
}

export const seedPromptRuns: PromptRunSeed[] = weeks.flatMap((week, weekIndex) =>
  seedPrompts.flatMap((prompt, promptIndex) =>
    seedLlmModels.map((model, modelIndex) => {
      const page = ownPages[(weekIndex + promptIndex + modelIndex) % ownPages.length];
      const hasOwnCitation = (promptIndex + modelIndex + weekIndex) % 3 !== 0;

      return {
        id: `run-${week}-${prompt.id}-${model.id}`,
        promptId: prompt.id,
        llmModelId: model.id,
        marketId: prompt.marketId,
        runAt: `${week}T00:${String((promptIndex * 7) % 60).padStart(2, "0")}:00.000Z`,
        status: "success",
        rawResponse: responseFor(prompt, model, weekIndex, promptIndex),
        rawMetadata: {
          locale: prompt.marketId === "market-kr" ? "ko-KR" : "en-US",
          source: "seed",
          basedOn: ["www.neodigm.com", "en.neodigm.com", "HubSpot partner profile"],
          citations: [
            ...(hasOwnCitation
              ? [
                  {
                    title: page.title,
                    url: page.url,
                    domain: new URL(page.url).hostname,
                    isOwnDomain: true,
                  },
                ]
              : []),
            {
              title: "네오다임 neodigm Partner Profile",
              url: "https://ecosystem.hubspot.com/marketplace/solutions/neodigm",
              domain: "ecosystem.hubspot.com",
              isOwnDomain: false,
            },
          ],
        },
      };
    })
  )
);

export const seedMentions: MentionSeed[] = seedPromptRuns.flatMap((run, runIndex) => {
  const weekIndex = weeks.findIndex((week) => run.runAt.startsWith(week));
  const ownPresent = (weekIndex + runIndex) % 5 !== 0;
  const competitorIds = ["brand-hubspot", "brand-marketo", "brand-salesforce"];
  const ownSentiment: Sentiment = ownPresent ? (weekIndex > 4 ? "positive" : "neutral") : "negative";
  return [
    {
      id: `mention-${run.id}-neodigm`,
      promptRunId: run.id,
      brandId: ownBrandId,
      isPresent: ownPresent,
      position: ownPresent ? ((runIndex + weekIndex) % 3) + 1 : null,
      sentiment: ownSentiment,
      sentimentScore: ownSentiment === "positive" ? 0.74 : ownSentiment === "neutral" ? 0.56 : 0.31,
    },
    ...competitorIds.map((brandId, competitorIndex) => {
      const sentiment: Sentiment = competitorIndex === 0 ? "positive" : "neutral";
      return {
        id: `mention-${run.id}-${brandId}`,
        promptRunId: run.id,
        brandId,
        isPresent: (runIndex + competitorIndex) % 4 !== 0,
        position: ((runIndex + competitorIndex) % 4) + 1,
        sentiment,
        sentimentScore: sentiment === "positive" ? 0.78 : 0.58,
      };
    }),
  ];
});

export const seedCitations: CitationSeed[] = seedPromptRuns.flatMap((run, runIndex) => {
  const page = ownPages[runIndex % ownPages.length];
  const hasOwnCitation = runIndex % 3 !== 0;
  const citations: CitationSeed[] = [];
  if (hasOwnCitation) {
    citations.push({
      id: `citation-${run.id}-neodigm`,
      promptRunId: run.id,
      brandId: ownBrandId,
      domain: new URL(page.url).hostname,
      pageUrl: page.url,
      title: page.title,
      isOwnDomain: true,
    });
  }
  citations.push({
    id: `citation-${run.id}-hubspot`,
    promptRunId: run.id,
    brandId: "brand-hubspot",
    domain: "ecosystem.hubspot.com",
    pageUrl: "https://ecosystem.hubspot.com/marketplace/solutions/neodigm",
    title: "네오다임 neodigm Partner Profile",
    isOwnDomain: false,
  });
  return citations;
});

export const seedVisibilityScores: VisibilityScoreSeed[] = weeks.flatMap((week, weekIndex) =>
  seedLlmModels.flatMap((model, modelIndex) =>
    ["market-kr", "market-us"].map((marketId, marketIndex) => {
      const base = 48 + weekIndex * 1.8 + (modelIndex % 3) * 2.4 - marketIndex * 1.7;
      const mentionsScore = Math.min(88, Math.round(base + 7));
      const citationsScore = Math.min(84, Math.round(base + 1));
      const positionScore = Math.min(82, Math.round(base - 2));
      const sentimentScore = Math.min(86, Math.round(base + 4));
      return {
        id: `score-${week}-${model.id}-${marketId}`,
        organizationId: orgId,
        brandId: ownBrandId,
        marketId,
        llmModelId: model.id,
        weekStart: week,
        mentionsScore,
        citationsScore,
        positionScore,
        sentimentScore,
        totalScore: Number(
          (mentionsScore * 0.35 + citationsScore * 0.15 + positionScore * 0.3 + sentimentScore * 0.2).toFixed(1)
        ),
      };
    })
  )
);

export const seedTrackedItems: TrackedItemSeed[] = [
  {
    id: "tracked-ai-search-optimization",
    organizationId: orgId,
    itemType: "topic",
    itemRefId: "topic-seo-ai-search",
    brandId: ownBrandId,
    categoryId: "cat-technical",
    status: "pending_confirmation",
    createdAt: "2026-08-30T09:10:00.000Z",
  },
  {
    id: "tracked-hubspot-onboarding",
    organizationId: orgId,
    itemType: "topic",
    itemRefId: "topic-hubspot-onboarding",
    brandId: ownBrandId,
    categoryId: "cat-automation",
    status: "pending_confirmation",
    createdAt: "2026-08-31T11:25:00.000Z",
  },
];

export const seedAgenticTrafficLogs: AgenticTrafficLogSeed[] = weeks.flatMap((week, weekIndex) =>
  ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "NaverBot"].flatMap((bot, botIndex) =>
    ownPages.map((page, pageIndex) => ({
      id: `agentic-${week}-${botIndex}-${pageIndex}`,
      domainId: page.url.includes("en.") ? "domain-neodigm-en" : "domain-neodigm-www",
      userAgent: `${bot}/seed (+https://neodio.local/bot-info)`,
      matchedBotName: bot,
      requestPath: new URL(page.url).pathname || "/",
      statusCode: pageIndex === 4 && botIndex === 3 ? 403 : 200,
      requestedAt: `${week}T${String(2 + botIndex).padStart(2, "0")}:${String(weekIndex * 7).padStart(2, "0")}:00.000Z`,
    }))
  )
);

export const seedReferralTrafficEvents: ReferralTrafficEventSeed[] = weeks.flatMap((week, weekIndex) =>
  seedLlmModels.slice(0, 5).map((model, modelIndex) => ({
    id: `referral-${week}-${model.id}`,
    domainId: modelIndex % 2 === 0 ? "domain-neodigm-www" : "domain-neodigm-en",
    sourceLlmModelId: model.id,
    landingPage: ownPages[(weekIndex + modelIndex) % ownPages.length].url,
    sessionId: `sess-${week.replaceAll("-", "")}-${modelIndex}`,
    occurredAt: `${week}T${String(9 + modelIndex).padStart(2, "0")}:30:00.000Z`,
    orderId: modelIndex === 0 && weekIndex % 2 === 0 ? `ord-${week.replaceAll("-", "")}` : null,
    revenueAmount: modelIndex === 0 && weekIndex % 2 === 0 ? 1_200_000 + weekIndex * 80_000 : null,
  }))
);
