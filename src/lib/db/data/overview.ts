import {
  ChecklistItem,
  ContentVisibility,
  Opportunity,
  WeeklySnapshot,
} from "../types";

// Each table below is keyed by organization id, the way real rows would be
// scoped by a tenant/org foreign key. Swap these modules for real queries
// (Prisma, Drizzle, a REST client, ...) without touching the callers in
// src/lib/db/index.ts.

// One row per week, oldest first. This is what a weekly snapshot job would
// actually write (captured every Sunday 00:00) — the dashboard only ever
// slices this array, it never derives a range from the current date.
export const snapshotsByOrg: Record<string, WeeklySnapshot[]> = {
  neodigm: [
    {
      capturedAt: "2026-07-12",
      weekLabel: "Jul 12, 2026",
      pointInTime: { visibilityScore: 49.8 },
      cumulative: {
        brandMentions: 92,
        citations: 54,
        agenticInteractions: 8_420,
        llmReferralTraffic: 188,
      },
      sentiment: { positive: 42, neutral: 38, negative: 20 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 92, citations: 54 },
        { brand: "HubSpot", isSelf: false, mentions: 128, citations: 88 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 74, citations: 41 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 68, citations: 37 },
      ],
      traffic: { agentic: 8420, referral: 188 },
    },
    {
      capturedAt: "2026-07-19",
      weekLabel: "Jul 19, 2026",
      pointInTime: { visibilityScore: 51.1 },
      cumulative: {
        brandMentions: 101,
        citations: 61,
        agenticInteractions: 9_130,
        llmReferralTraffic: 204,
      },
      sentiment: { positive: 44, neutral: 39, negative: 17 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 101, citations: 61 },
        { brand: "HubSpot", isSelf: false, mentions: 134, citations: 91 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 78, citations: 45 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 70, citations: 40 },
      ],
      traffic: { agentic: 9130, referral: 204 },
    },
    {
      capturedAt: "2026-07-26",
      weekLabel: "Jul 26, 2026",
      pointInTime: { visibilityScore: 52.7 },
      cumulative: {
        brandMentions: 108,
        citations: 69,
        agenticInteractions: 10_044,
        llmReferralTraffic: 231,
      },
      sentiment: { positive: 47, neutral: 37, negative: 16 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 108, citations: 69 },
        { brand: "HubSpot", isSelf: false, mentions: 139, citations: 95 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 82, citations: 48 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 74, citations: 43 },
      ],
      traffic: { agentic: 10044, referral: 231 },
    },
    {
      capturedAt: "2026-08-02",
      weekLabel: "Aug 2, 2026",
      pointInTime: { visibilityScore: 54.9 },
      cumulative: {
        brandMentions: 119,
        citations: 77,
        agenticInteractions: 11_380,
        llmReferralTraffic: 266,
      },
      sentiment: { positive: 50, neutral: 35, negative: 15 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 119, citations: 77 },
        { brand: "HubSpot", isSelf: false, mentions: 145, citations: 99 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 86, citations: 51 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 79, citations: 46 },
      ],
      traffic: { agentic: 11380, referral: 266 },
    },
    {
      capturedAt: "2026-08-09",
      weekLabel: "Aug 9, 2026",
      pointInTime: { visibilityScore: 57.3 },
      cumulative: {
        brandMentions: 132,
        citations: 86,
        agenticInteractions: 12_970,
        llmReferralTraffic: 302,
      },
      sentiment: { positive: 53, neutral: 34, negative: 13 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 132, citations: 86 },
        { brand: "HubSpot", isSelf: false, mentions: 151, citations: 104 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 91, citations: 55 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 83, citations: 48 },
      ],
      traffic: { agentic: 12970, referral: 302 },
    },
    {
      capturedAt: "2026-08-16",
      weekLabel: "Aug 16, 2026",
      pointInTime: { visibilityScore: 60.4 },
      cumulative: {
        brandMentions: 146,
        citations: 98,
        agenticInteractions: 14_260,
        llmReferralTraffic: 341,
      },
      sentiment: { positive: 57, neutral: 31, negative: 12 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 146, citations: 98 },
        { brand: "HubSpot", isSelf: false, mentions: 158, citations: 108 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 95, citations: 58 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 87, citations: 51 },
      ],
      traffic: { agentic: 14260, referral: 341 },
    },
    {
      capturedAt: "2026-08-23",
      weekLabel: "Aug 23, 2026",
      pointInTime: { visibilityScore: 62.8 },
      cumulative: {
        brandMentions: 158,
        citations: 111,
        agenticInteractions: 15_840,
        llmReferralTraffic: 386,
      },
      sentiment: { positive: 61, neutral: 29, negative: 10 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 158, citations: 111 },
        { brand: "HubSpot", isSelf: false, mentions: 163, citations: 112 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 99, citations: 61 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 91, citations: 54 },
      ],
      traffic: { agentic: 15840, referral: 386 },
    },
    {
      capturedAt: "2026-08-30",
      weekLabel: "Aug 30, 2026",
      pointInTime: { visibilityScore: 65.6 },
      cumulative: {
        brandMentions: 171,
        citations: 126,
        agenticInteractions: 17_430,
        llmReferralTraffic: 428,
      },
      sentiment: { positive: 64, neutral: 27, negative: 9 },
      market: [
        { brand: "Neodigm", isSelf: true, mentions: 171, citations: 126 },
        { brand: "HubSpot", isSelf: false, mentions: 169, citations: 116 },
        { brand: "Adobe Marketo Engage", isSelf: false, mentions: 103, citations: 65 },
        { brand: "Salesforce Marketing Cloud", isSelf: false, mentions: 95, citations: 57 },
      ],
      traffic: { agentic: 17430, referral: 428 },
    },
  ],
};

// Confirmed copy from Figma "Content Visibility Card" (646:11318).
export const contentVisibilityByOrg: Record<string, ContentVisibility> = {
  neodigm: {
    visiblePercent: 22,
    statusLabel: "낮음 — 대부분의 콘텐츠가 AI 모델에 노출되지 않음",
    headline: "AI가 콘텐츠를 인식하지 못하고 있습니다",
    detail:
      "AI 모델이 페이지를 제대로 읽지 못하고 있습니다. Content Visibility 점수를 개선하면 AI 검색 결과 노출을 높일 수 있습니다.",
    buttonLabel: "AI가 못 읽는 콘텐츠 보기",
    cta: {
      title: "몇 분 만에 사이트를 개선하세요.",
      detail: "브랜드 맞춤 분석은 저희 팀에 문의해 주세요.",
    },
  },
};

// 원래 Figma "Modal - Your AI Visibility Journey" / "Modal - Your Prompting
// Strategy" 카피 그대로였으나 docs/overview-checklists-plan.md 기획에 따라
// 개편: 이 프로젝트에 없는 기능(엣지 사전 렌더링/CDN 봇 배포)을 가정한 단계
// 2개는 삭제, 나머지는 실제로 이동 가능한 페이지(`href`)를 달았다. `href`가
// 없는 단계는 관련 기능(CDN/Analytics 연동 화면, AI 프롬프트 제안)이 아직
// 없다는 뜻 — ChecklistCard가 이 경우 "준비 중"으로 표시한다. `done`은
// page.tsx가 실 데이터(수집된 인용, GSC 연결 상태, 프롬프트 라이브러리 출처)
// 기준으로 덮어쓴다.
export const checklistByOrg: Record<string, ChecklistItem[]> = {
  neodigm: [
    {
      id: "more-insights",
      title: "더 많은 인사이트를 확인하는 다음 단계",
      description: "거의 다 왔어요. 한 단계씩 AI에게 발견되고 선택받는 브랜드로 가까워집니다.",
      completedSteps: 1,
      totalSteps: 4,
      steps: [
        {
          id: "sign-up",
          title: "가입 완료",
          description: "계정이 활성화되어 바로 사용할 수 있습니다.",
          done: true,
        },
        {
          id: "connect-traffic",
          title: "네이버·구글 AI 답변 수집 시작하기",
          description: "수집을 실행하면 어떤 AI 엔진이 실제로 우리 브랜드를 인용하는지 확인할 수 있습니다.",
          done: false,
          href: "/collection-runs",
        },
        {
          id: "more-exposure",
          title: "프롬프트 라이브러리에 새 프롬프트 추가하기",
          description: "고객이 AI 어시스턴트에게 무엇을 묻는지 등록하면, 그 답변에 노출될 수 있도록 도와드립니다.",
          done: false,
          href: "/prompt-library",
        },
        {
          id: "find-opportunities",
          title: "시장 기회 발견하기",
          description: "AI 기반 검색 결과에서 점유율을 높이고 시장을 더 넓힐 수 있는 지점을 확인하세요.",
          done: false,
          href: "/opportunities",
        },
      ],
    },
    {
      id: "prompt-strategy",
      title: "프롬프트 전략 강화하기",
      description: "각 소스를 연동해서 더 풍부한 AI 가시성 인사이트를 확인하세요.",
      completedSteps: 1,
      totalSteps: 5,
      steps: [
        {
          id: "connect-cdn",
          title: "AI 트래픽 분석을 위해 CDN 연동하기",
          description: "CDN 로그를 연동하면 어떤 AI 엔진이 콘텐츠를 방문·인용하는지 확인할 수 있습니다.",
          done: false,
        },
        {
          id: "connect-search-console",
          title: "쿼리 분석을 위해 Google Search Console 연동하기",
          description: "실제 검색 쿼리를 가져와서, 사용자가 AI 답변을 받기 전에 무엇을 검색하는지 확인하세요.",
          done: false,
          href: "/brands-management/brand-neodigm/connections",
        },
        {
          id: "connect-web-analytics",
          title: "리퍼럴 트래픽 인사이트를 위해 웹 분석 연동하기",
          description: "Google Analytics 4 또는 Adobe Analytics를 연결해 AI 기반 리퍼럴 트래픽을 측정하세요.",
          done: false,
        },
        {
          id: "upload-prompts",
          title: "프롬프트 직접 업로드하기",
          description: "고객이 실제로 묻는 질문을 추가해서 AI 답변 커버리지를 개선하세요.",
          done: false,
          href: "/prompt-library",
        },
        {
          id: "add-suggested-prompts",
          title: "라이브러리에 프롬프트 제안 추가하기",
          description: "AI가 생성한 프롬프트 제안을 검토하고 추가해서 더 풍부한 프롬프트 라이브러리를 만드세요.",
          done: false,
        },
      ],
    },
  ],
};

export const opportunitiesByOrg: Record<string, Opportunity[]> = {
  neodigm: [
    {
      id: "toc-head-section",
      category: "기술 & GEO",
      title: "목차(Table of Content)",
    },
    {
      id: "third-party-sentiment-neodigm",
      category: "획득 콘텐츠",
      title: "타사 인용 감성 분석 - Neodigm",
    },
    {
      id: "hubspot-onboarding-gap",
      category: "마케팅 자동화",
      title: "HubSpot 온보딩 파트너 문맥 보강",
    },
  ],
};
