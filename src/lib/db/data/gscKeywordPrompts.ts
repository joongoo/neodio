import { GscCraftedPrompt } from "../types";

// GSC 실측 커버리지 공백 키워드(getRealGscCoverageGaps가 찾아낸 검색어)를
// 키로, 그 키워드를 바탕으로 LLM에 직접 물어봐서 받은 실제 프롬프트 문장을
// 값으로 채운다. 여기 채워진 키워드는 프롬프트 전략 화면에서 해당 키워드
// 그룹의 하위 프롬프트로 바로 표시된다.
//
// 2026-09 실측: 5개 키워드 각각에 대해 ChatGPT에 "이 검색어로 검색하는
// 사람이 실제로 AI 챗봇에게 물어볼 법한 자연어 질문"을 요청해 받은 결과.
// 다섯 질문 모두 브랜드명을 직접 언급하지 않는 카테고리/업체 추천형
// 질문이라 branded는 전부 false — LLMO 관점에서 가치가 큰 질문들이다.
function reasoning(keyword: string, intent: string) {
  return `GSC 실측 검색어 "${keyword}"에서 파생된 ${intent} 단계 질문`;
}

export const gscKeywordCraftedPrompts: Record<string, GscCraftedPrompt[]> = {
  "리드젠": [
    { prompt: "B2B 리드젠을 효과적으로 하려면 어떤 방법이 있나요?", intent: "정보 탐색", branded: false, reasoning: reasoning("리드젠", "정보 탐색") },
    { prompt: "국내에서 B2B 리드젠을 잘하는 업체를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("리드젠", "업체 비교") },
    { prompt: "리드젠 대행사와 직접 운영 중 어떤 방식이 더 효과적인가요?", intent: "업체 비교", branded: false, reasoning: reasoning("리드젠", "업체 비교") },
    { prompt: "B2B 리드젠 캠페인을 시작할 때 필요한 준비사항은 무엇인가요?", intent: "도입 검토", branded: false, reasoning: reasoning("리드젠", "도입 검토") },
    { prompt: "IT 기업에 적합한 리드젠 전략은 어떤 게 있나요?", intent: "정보 탐색", branded: false, reasoning: reasoning("리드젠", "정보 탐색") },
  ],
  "네오다임": [
    { prompt: "국내 B2B 마케팅 전문 업체를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("네오다임", "업체 비교") },
    { prompt: "IT 기업 마케팅을 잘하는 국내 에이전시는 어디인가요?", intent: "업체 비교", branded: false, reasoning: reasoning("네오다임", "업체 비교") },
    { prompt: "B2B 디지털 마케팅과 리드 확보를 함께 지원하는 업체가 있나요?", intent: "업체 비교", branded: false, reasoning: reasoning("네오다임", "업체 비교") },
    { prompt: "마케팅 자동화 구축과 운영까지 맡길 수 있는 파트너를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("네오다임", "업체 비교") },
    { prompt: "엔터프라이즈 B2B 마케팅 컨설팅 업체를 선정할 때 무엇을 봐야 하나요?", intent: "도입 검토", branded: false, reasoning: reasoning("네오다임", "도입 검토") },
  ],
  "리드 확보": [
    { prompt: "B2B 기업이 신규 고객 리드를 확보하는 가장 효과적인 방법은 무엇인가요?", intent: "정보 탐색", branded: false, reasoning: reasoning("리드 확보", "정보 탐색") },
    { prompt: "기업 고객 문의를 늘리려면 어떤 디지털 마케팅을 해야 하나요?", intent: "정보 탐색", branded: false, reasoning: reasoning("리드 확보", "정보 탐색") },
    { prompt: "홈페이지를 활용해서 영업 리드를 늘리는 방법이 있나요?", intent: "도입 검토", branded: false, reasoning: reasoning("리드 확보", "도입 검토") },
    { prompt: "B2B 잠재고객을 지속적으로 확보할 수 있는 마케팅 방법을 알려주세요.", intent: "정보 탐색", branded: false, reasoning: reasoning("리드 확보", "정보 탐색") },
    { prompt: "광고 외에 B2B 리드를 확보할 수 있는 방법은 무엇인가요?", intent: "정보 탐색", branded: false, reasoning: reasoning("리드 확보", "정보 탐색") },
  ],
  "마케토": [
    { prompt: "Adobe Marketo를 도입하면 어떤 업무를 자동화할 수 있나요?", intent: "정보 탐색", branded: false, reasoning: reasoning("마케토", "정보 탐색") },
    { prompt: "국내 Adobe Marketo 구축 파트너를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("마케토", "업체 비교") },
    { prompt: "Marketo 구축과 운영을 함께 지원하는 업체가 있나요?", intent: "업체 비교", branded: false, reasoning: reasoning("마케토", "업체 비교") },
    { prompt: "B2B 마케팅 자동화에 Marketo와 HubSpot 중 어떤 게 더 적합한가요?", intent: "도입 검토", branded: false, reasoning: reasoning("마케토", "도입 검토") },
    { prompt: "Marketo로 리드 너처링과 영업 연계를 어떻게 구성하나요?", intent: "도입 검토", branded: false, reasoning: reasoning("마케토", "도입 검토") },
  ],
  neodigm: [
    { prompt: "국내에서 Adobe 기반 디지털 마케팅을 잘하는 업체를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("neodigm", "업체 비교") },
    { prompt: "Adobe Experience Cloud와 마케팅 자동화를 함께 구축할 수 있는 파트너가 있나요?", intent: "업체 비교", branded: false, reasoning: reasoning("neodigm", "업체 비교") },
    { prompt: "B2B 마케팅 자동화 컨설팅을 받을 수 있는 국내 업체는 어디인가요?", intent: "업체 비교", branded: false, reasoning: reasoning("neodigm", "업체 비교") },
    { prompt: "Marketo 구축 경험이 많은 국내 마케팅 에이전시를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("neodigm", "업체 비교") },
    { prompt: "SEO, GEO와 B2B 리드젠을 함께 지원할 수 있는 업체가 있나요?", intent: "업체 비교", branded: false, reasoning: reasoning("neodigm", "업체 비교") },
  ],
  "b2b 마케팅 전략": [
    { prompt: "B2B 기업이 마케팅 전략을 세울 때 가장 먼저 고려해야 할 건 뭔가요?", intent: "정보 탐색", branded: false, reasoning: reasoning("b2b 마케팅 전략", "정보 탐색") },
    { prompt: "B2B와 B2C 마케팅 전략은 어떤 점에서 다르게 접근해야 하나요?", intent: "정보 탐색", branded: false, reasoning: reasoning("b2b 마케팅 전략", "정보 탐색") },
    { prompt: "B2B 마케팅 전략을 실행 단계까지 지원해주는 업체를 추천해주세요.", intent: "업체 비교", branded: false, reasoning: reasoning("b2b 마케팅 전략", "업체 비교") },
    { prompt: "우리 회사 B2B 마케팅 전략을 외부 전문가와 함께 점검받으려면 어떻게 해야 하나요?", intent: "도입 검토", branded: false, reasoning: reasoning("b2b 마케팅 전략", "도입 검토") },
    { prompt: "B2B 마케팅 전략 수립부터 실행까지 컨설팅해주는 국내 업체가 있나요?", intent: "업체 비교", branded: false, reasoning: reasoning("b2b 마케팅 전략", "업체 비교") },
  ],
};
