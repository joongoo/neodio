import { SearchTrendResult } from "../types";

// Naver DataLab API 미연동 mock — docs/naver-datalab-search-trend-plan.md 참고.
// 실 연동 전이라 클라이언트 아이디/시크릿이 없고, 화면 구조만 미리 검증하기 위한 상대 지수
// 값을 손으로 채워뒀다. searchCollectionByKeyword와 같은 키("마케팅 자동화"/"네오다임")로
// 맞춰 검색결과 리서치 화면과 나란히 비교해볼 수 있게 했다.
export const searchTrendByKeyword: Record<string, SearchTrendResult> = {
  "마케팅 자동화": {
    startDate: "2026-03-01",
    endDate: "2026-09-01",
    timeUnit: "month",
    series: [
      {
        id: "st-topic",
        groupName: "마케팅 자동화",
        keywords: ["마케팅 자동화", "marketing automation"],
        data: [
          { period: "2026-03-01", ratio: 41.2 },
          { period: "2026-04-01", ratio: 48.6 },
          { period: "2026-05-01", ratio: 52.1 },
          { period: "2026-06-01", ratio: 61.8 },
          { period: "2026-07-01", ratio: 70.4 },
          { period: "2026-08-01", ratio: 84.9 },
          { period: "2026-09-01", ratio: 100.0 },
        ],
      },
      {
        id: "st-brand",
        groupName: "네오다임",
        keywords: ["네오다임", "Neodigm"],
        data: [
          { period: "2026-03-01", ratio: 12.0 },
          { period: "2026-04-01", ratio: 14.3 },
          { period: "2026-05-01", ratio: 15.9 },
          { period: "2026-06-01", ratio: 22.7 },
          { period: "2026-07-01", ratio: 28.5 },
          { period: "2026-08-01", ratio: 35.1 },
          { period: "2026-09-01", ratio: 44.8 },
        ],
      },
      {
        id: "st-competitor",
        groupName: "HubSpot",
        keywords: ["HubSpot", "허브스팟"],
        data: [
          { period: "2026-03-01", ratio: 55.4 },
          { period: "2026-04-01", ratio: 58.0 },
          { period: "2026-05-01", ratio: 54.2 },
          { period: "2026-06-01", ratio: 60.1 },
          { period: "2026-07-01", ratio: 63.7 },
          { period: "2026-08-01", ratio: 66.9 },
          { period: "2026-09-01", ratio: 72.3 },
        ],
      },
    ],
  },
  "네오다임": {
    startDate: "2026-03-01",
    endDate: "2026-09-01",
    timeUnit: "month",
    series: [
      {
        id: "st-nd-brand",
        groupName: "네오다임",
        keywords: ["네오다임", "Neodigm"],
        data: [
          { period: "2026-03-01", ratio: 20.5 },
          { period: "2026-04-01", ratio: 24.1 },
          { period: "2026-05-01", ratio: 27.8 },
          { period: "2026-06-01", ratio: 38.6 },
          { period: "2026-07-01", ratio: 52.3 },
          { period: "2026-08-01", ratio: 71.0 },
          { period: "2026-09-01", ratio: 100.0 },
        ],
      },
      {
        id: "st-nd-competitor",
        groupName: "HubSpot",
        keywords: ["HubSpot", "허브스팟"],
        data: [
          { period: "2026-03-01", ratio: 60.2 },
          { period: "2026-04-01", ratio: 58.9 },
          { period: "2026-05-01", ratio: 57.4 },
          { period: "2026-06-01", ratio: 62.0 },
          { period: "2026-07-01", ratio: 64.8 },
          { period: "2026-08-01", ratio: 68.2 },
          { period: "2026-09-01", ratio: 70.5 },
        ],
      },
    ],
  },
};
