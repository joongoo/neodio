import { BrandsManagementData } from "../types";
import { seedCategories, seedPrompts, seedTopics } from "./seed";

// `markets` used to be free-text ("한국 (KR)", "미국 (US)") that didn't match
// seedMarkets — the market list PromptRunSeed.marketId is actually collected
// against. Using seedMarkets' own labels here means Overview's market filter
// can map a selected label straight back to a marketId and filter real
// collected runs by it, same as the category/platform filters.

// Categories used to be a separate hand-picked list (마케팅/자동화 툴/광고) that
// didn't line up with the topic categories the real prompt/LLM-run pipeline
// is actually organized by (seedCategories → seedTopics.categoryId →
// seedPrompts.topicId), nor with Prompt Library's own free-text category
// strings. Brand Management is now the single source of truth: it mirrors
// seedCategories 1:1, with promptCount computed from the real prompt count
// per category instead of a hardcoded guess — so Overview's category filter
// (and anything else reading brandsManagementByOrg.categories) stays correct
// as topics/prompts change instead of drifting out of sync.
const categories = seedCategories.map((category) => ({
  id: category.id,
  name: category.name,
  promptCount: seedPrompts.filter(
    (prompt) => seedTopics.find((topic) => topic.id === prompt.topicId)?.categoryId === category.id
  ).length,
  origin: "system" as const,
}));

// Matches Figma "Brands Management" (doc §21) — our own org's tracked
// brands/categories, pure CRUD, no 3rd-party dependency.
export const brandsManagementByOrg: Record<string, BrandsManagementData> = {
  neodigm: {
    brands: [
      {
        id: "brand-neodigm",
        name: "Neodigm",
        url: "https://neodigm.com",
        sitemapUrl: "https://neodigm.com/sitemap.xml",
        description: "AI 가시성 대시보드를 만드는 B2B SaaS",
        industry: "B2B SaaS",
        markets: ["한국"],
        status: "active",
        aliases: ["네오다임", "네오디지엠"],
        otherBrands: ["HubSpot", "Salesforce", "Rinda AI"],
        urls: ["https://blog.neodigm.com"],
        socialAccounts: [{ platform: "LinkedIn", handle: "neodigm" }],
        earnedContentSources: ["cafe.naver.com/ticketsuccess"],
        cdnConnected: false,
        gscConnected: true,
        analyticsConnected: false,
      },
      {
        id: "brand-growth-collective",
        name: "Growth Collective",
        url: "https://growthcollective.io",
        sitemapUrl: "",
        description: "",
        industry: "",
        markets: ["미국"],
        status: "pending",
        aliases: [],
        otherBrands: [],
        urls: [],
        socialAccounts: [],
        earnedContentSources: [],
        cdnConnected: false,
        gscConnected: false,
        analyticsConnected: false,
      },
      {
        id: "brand-peak-marketing",
        name: "Peak Marketing",
        url: "https://peakmarketing.co",
        sitemapUrl: "",
        description: "",
        industry: "",
        markets: ["전세계"],
        status: "pending",
        aliases: [],
        otherBrands: [],
        urls: [],
        socialAccounts: [],
        earnedContentSources: [],
        cdnConnected: false,
        gscConnected: false,
        analyticsConnected: false,
      },
    ],
    categories,
  },
};
