import { BrandPresenceData, ContentRecoveryOpportunity, PromptStrategyData, UrlInspectorData } from "../types";

// 목업(mock) 데이터가 없는 조직용 빈 기본값 — 목업은 기본 조직(Neodigm)에만
// 있어서, 새 조직에서 목업을 기반으로 실데이터를 덧씌우는 페이지들이 빈
// 화면(null)이 되지 않고 "아직 데이터 없음" 상태로 그려지게 한다. 다른 조직의
// 목업을 가져다 쓰면 안 된다(남의 데이터처럼 보인다).

export const EMPTY_PROMPT_STRATEGY: PromptStrategyData = { suggestions: [], topics: [] };

export const EMPTY_BRAND_PRESENCE: BrandPresenceData = {
  allCompetitors: [],
  defaultSelectedCompetitors: [],
  mentionsByWeek: [],
  citationsByWeek: [],
  sentimentByWeek: [],
  promptMetricsByWeek: [],
  topMovers: [],
  bottomMovers: [],
  dataInsights: [],
  shareOfVoice: [],
};

export const EMPTY_URL_INSPECTOR: UrlInspectorData = {
  ownCitedPrompts: 0,
  totalCitedPrompts: 0,
  uniqueCitedUrls: 0,
  totalCitations: 0,
  ownUrls: [],
  thirdPartyUrls: [],
  citedDomains: [],
};

export function emptyContentRecovery(): ContentRecoveryOpportunity {
  return {
    title: "콘텐츠 가시성 복구",
    createdAt: new Date().toISOString(),
    affectedUrls: 0,
    expectedVisibilityMultiplier: 1,
    averageContentVisibility: 0,
    description: "브랜드 설정에서 사이트맵 크롤을 실행하면 AI가 읽지 못하는 페이지가 여기에 표시됩니다.",
    optimizedCount: 0,
    totalCount: 0,
    urls: [],
  };
}
