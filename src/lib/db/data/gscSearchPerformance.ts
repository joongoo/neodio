import { GscSearchPerformanceResult } from "../types";

// GSC Search Analytics API 미연동 mock — docs/gsc-search-analytics-plan.md 참고.
// OAuth 연동 전이라 실제 searchanalytics.query 호출은 없고, gscConnectionByBrand가
// "connected"인 브랜드(brand-neodigm)에 대해서만 화면 구조 검증용 데이터를 채워뒀다.
export const gscSearchPerformanceByBrand: Record<string, GscSearchPerformanceResult> = {
  "brand-neodigm": {
    brandId: "brand-neodigm",
    property: "https://neodigm.com/",
    trend: [
      { week: "8/4", clicks: 780, impressions: 24_100 },
      { week: "8/11", clicks: 812, impressions: 25_600 },
      { week: "8/18", clicks: 865, impressions: 27_300 },
      { week: "8/25", clicks: 901, impressions: 28_900 },
      { week: "9/1", clicks: 980, impressions: 31_200 },
    ],
    topQueries: [
      { id: "q-1", query: "마케팅 자동화", clicks: 214, impressions: 6_820, ctr: 0.0314, position: 4.2 },
      { id: "q-2", query: "네오다임", clicks: 188, impressions: 2_140, ctr: 0.0879, position: 1.8 },
      { id: "q-3", query: "리드 스코어링 툴", clicks: 96, impressions: 3_050, ctr: 0.0315, position: 6.1 },
      { id: "q-4", query: "b2b crm 자동화", clicks: 74, impressions: 2_410, ctr: 0.0307, position: 7.4 },
      { id: "q-5", query: "네오다임 요금제", clicks: 61, impressions: 890, ctr: 0.0685, position: 2.3 },
    ],
  },
};
