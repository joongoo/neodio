import { PromptResearchResult } from "../types";

// Matches Figma "Prompt Research Screen - Results (Wireframe)" (node
// 646:12033, Korean page) for the seeded topic "마케팅 자동화", trimmed to P0
// fields (neodigm_p0_scope.md §2) — no search volume or organic traffic,
// since those require a keyword/SEO API we don't have. Other topics fall
// back to the empty state until a real /prompt-research pipeline exists.
export const promptResearchByTopic: Record<string, PromptResearchResult> = {
  "마케팅 자동화": {
    topic: "마케팅 자동화",
    stats: {
      uniqueTopics: 6,
      uniquePrompts: 180,
      uniqueBrands: 6,
      uniqueSourceDomains: 5,
    },
    intent: { informational: 52, commercial: 31, transactional: 17 },
    relatedTopics: [
      {
        id: "rt-1",
        topic: "소셜미디어 광고",
        promptCount: 40,
        relevancy: "낮음",
        subPrompts: [
          {
            id: "rt-1-sp-1",
            prompt: "B2B 기업에게 가장 효과적인 소셜미디어 광고 채널은 어디인가요?",
            model: "ChatGPT",
            aiResponseSummary: "LinkedIn 광고를 우선 추천하며, HubSpot과 Neodigm을 함께 언급.",
            brandsMentioned: 3,
            sourcesCited: 4,
          },
          {
            id: "rt-1-sp-2",
            prompt: "소셜미디어 광고 자동화 도구를 추천해 주세요.",
            model: "Gemini",
            aiResponseSummary: "Meta Ads Manager와 함께 마케팅 자동화 플랫폼 연동 사례를 소개.",
            brandsMentioned: 2,
            sourcesCited: 3,
          },
        ],
      },
      {
        id: "rt-2",
        topic: "이메일 마케팅 자동화",
        promptCount: 35,
        relevancy: "높음",
        subPrompts: [
          {
            id: "rt-2-sp-1",
            prompt: "이메일 마케팅 자동화를 검토하는 B2B 기업에게 추천할 만한 솔루션은?",
            model: "ChatGPT",
            aiResponseSummary: "Neodigm, HubSpot, Salesforce 순으로 비교하며 온보딩 난이도를 언급.",
            brandsMentioned: 5,
            sourcesCited: 7,
          },
          {
            id: "rt-2-sp-2",
            prompt: "이메일 마케팅 자동화 도입 시 ROI를 어떻게 측정하나요?",
            model: "Claude",
            aiResponseSummary: "오픈율/클릭율 기준 벤치마크와 함께 Neodigm 사례 데이터를 인용.",
            brandsMentioned: 4,
            sourcesCited: 6,
          },
          {
            id: "rt-2-sp-3",
            prompt: "이메일 마케팅 자동화와 CRM을 연동하는 가장 좋은 방법은?",
            model: "ChatGPT",
            aiResponseSummary: "HubSpot과 Salesforce 연동 방식을 비교, Neodigm은 언급되지 않음.",
            brandsMentioned: 2,
            sourcesCited: 3,
          },
        ],
      },
      {
        id: "rt-3",
        topic: "리드 스코어링",
        promptCount: 28,
        relevancy: "높음",
        subPrompts: [
          {
            id: "rt-3-sp-1",
            prompt: "리드 스코어링 모델을 처음 도입할 때 어떤 기준으로 설계해야 하나요?",
            model: "ChatGPT",
            aiResponseSummary: "행동 기반 스코어링을 우선 추천하며 Salesforce 사례를 인용.",
            brandsMentioned: 3,
            sourcesCited: 5,
          },
        ],
      },
      {
        id: "rt-4",
        topic: "CRM 연동",
        promptCount: 24,
        relevancy: "중간",
        subPrompts: [
          {
            id: "rt-4-sp-1",
            prompt: "마케팅 자동화 툴과 CRM을 연동할 때 주의할 점은 무엇인가요?",
            model: "Gemini",
            aiResponseSummary: "데이터 중복 이슈를 지적하며 HubSpot의 네이티브 연동을 언급.",
            brandsMentioned: 2,
            sourcesCited: 4,
          },
        ],
      },
      {
        id: "rt-5",
        topic: "마케팅 자동화 ROI",
        promptCount: 21,
        relevancy: "Best",
        subPrompts: [
          {
            id: "rt-5-sp-1",
            prompt: "마케팅 자동화 도입 후 ROI를 입증한 사례가 있나요?",
            model: "ChatGPT",
            aiResponseSummary: "Neodigm 고객사 사례를 상세히 인용하며 매출 증가율을 제시.",
            brandsMentioned: 4,
            sourcesCited: 6,
          },
        ],
      },
      {
        id: "rt-6",
        topic: "B2B 리드 육성",
        promptCount: 18,
        relevancy: "중간",
        subPrompts: [
          {
            id: "rt-6-sp-1",
            prompt: "B2B 리드 육성(nurturing) 캠페인은 어떻게 설계하나요?",
            model: "Claude",
            aiResponseSummary: "단계별 이메일 시퀀스를 제안하며 Neodigm과 HubSpot을 비교.",
            brandsMentioned: 3,
            sourcesCited: 5,
          },
        ],
      },
    ],
    brands: [
      { id: "b-1", brand: "Neodigm", mentions: 268, sourceDomains: 12, examplePrompt: "어떤 브랜드가 마케팅 자동화에 가장 좋나요?" },
      { id: "b-2", brand: "HubSpot", mentions: 231, sourceDomains: 15, examplePrompt: "HubSpot과 세일즈포스 중 어떤 게 나을까요?" },
      { id: "b-3", brand: "Salesforce", mentions: 198, sourceDomains: 14, examplePrompt: "세일즈포스 마케팅 클라우드는 B2B에 적합한가요?" },
      { id: "b-4", brand: "Rinda AI", mentions: 87, sourceDomains: 6, examplePrompt: "해외 바이어 발굴 자동화 도구 추천해줘." },
      { id: "b-5", brand: "Adobe Marketo Engage", mentions: 74, sourceDomains: 5, examplePrompt: "대기업용 마케팅 자동화 솔루션은 뭐가 있나요?" },
      { id: "b-6", brand: "세일즈맵", mentions: 41, sourceDomains: 3, examplePrompt: "국내 B2B 영업·마케팅 협업 툴 추천해줘." },
    ],
    sourceDomains: [
      { id: "sd-1", domain: "reddit.com", mentions: 61, sourceUrls: 42, examplePrompt: "마케팅 자동화는 어디서 배울 수 있나요?" },
      { id: "sd-2", domain: "cafe.naver.com", mentions: 47, sourceUrls: 31, examplePrompt: "국내에서 쓸만한 마케팅 자동화 후기 있나요?" },
      { id: "sd-3", domain: "blog.neodigm.com", mentions: 33, sourceUrls: 18, examplePrompt: "마케팅 자동화 솔루션 비교글 있나요?" },
      { id: "sd-4", domain: "www.i-boss.co.kr", mentions: 19, sourceUrls: 12, examplePrompt: "실무자들이 추천하는 마케팅 자동화 툴은?" },
      { id: "sd-5", domain: "www.rinda.ai", mentions: 15, sourceUrls: 9, examplePrompt: "해외 아웃바운드 자동화는 어떤 도구가 좋나요?" },
    ],
  },
};
