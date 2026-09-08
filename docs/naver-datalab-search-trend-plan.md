# 네이버 데이터랩 통합 검색어 트렌드 API 연동 기획

> 상태: **기획 단계** — 네이버 개발자센터 애플리케이션에 "데이터랩(검색어트렌드)" API 권한이 아직 없음.
> 권한 발급 후 이 문서의 "구현 순서"를 따라 실제 연동 착수.

## 1. API 개요 (요약)

- 엔드포인트: `POST https://openapi.naver.com/v1/datalab/search`
- 인증: 비로그인 오픈 API — 헤더 `X-Naver-Client-Id`, `X-Naver-Client-Secret`
- 호출 한도: **일 1,000회**
- 조회 가능 범위: 2016-01-01 ~ 현재, `timeUnit`은 date/week/month
- 요청 파라미터 핵심: `keywordGroups` (최대 5그룹 × 그룹당 검색어 최대 20개), 선택 필터로 `device`(pc/mo), `gender`(m/f), `ages`(1~11 구간코드)
- 응답: 그룹(주제어)별로 구간(`period`)마다 **상대 검색량 비율(`ratio`, 0~100, 구간 내 최댓값=100)**을 반환. 절대 검색량이 아니라 **상대값**이라는 점이 대시보드 설계에서 가장 중요한 제약.

## 2. 이 프로젝트의 기존 구조와의 연결점

- [src/lib/db/types.ts:397](../src/lib/db/types.ts:397)의 주석대로 네이버는 두 표면으로 이미 구분되어 있음:
  1. **AI-챗 표면** — Prompt Research 파이프라인 재사용 (`prompt_runs`/`mentions`/`citations`)
  2. **통합검색 랭킹 표면** — `naver_search_results` (블록타입/순위/URL) — [Search Collection 화면](../src/app/search-collection/page.tsx)
- 검색어 트렌드는 이 둘과 다른 **세 번째 표면**: 랭킹이 아니라 "특정 키워드가 시간에 따라 얼마나 검색됐는가"라는 시계열 데이터. 기존 `naver`/`google` 랭킹 테이블에 끼워 넣지 않고 별도 테이블/화면으로 분리하는 것을 제안.
- 목적("LLM에 붙이려고")에 맞춰 트렌드 데이터는 Prompt Research의 LLM 언급량·검색 노출 데이터와 **교차 분석**하는 용도로 사용: 특정 브랜드/토픽의 네이버 검색 트렌드 상승/하락이 LLM 답변 내 언급 빈도와 상관이 있는지 보여주는 것이 핵심 가치.

## 3. 제안 데이터 모델

```ts
// src/lib/db/types.ts 에 추가할 형태 (제안)
export interface SearchTrendPoint {
  period: string;   // yyyy-mm-dd (timeUnit에 따라 주/월 시작일)
  ratio: number;     // 0~100 상대값
}

export interface SearchTrendSeries {
  id: string;
  groupName: string;        // 주제어 (예: "네오다임")
  keywords: string[];       // 묶은 검색어들 (예: ["네오다임", "Neodigm"])
  timeUnit: "date" | "week" | "month";
  device?: "pc" | "mo";
  gender?: "m" | "f";
  ages?: string[];
  data: SearchTrendPoint[];
  collectedAt: string;      // 이 시리즈를 조회한 시각(ISO)
}

export interface SearchTrendResult {
  startDate: string;
  endDate: string;
  timeUnit: "date" | "week" | "month";
  series: SearchTrendSeries[];
}
```

- `ratio`가 상대값이므로 **자체 브랜드군 vs 경쟁사군을 같은 요청의 서로 다른 `keywordGroups`로 묶어야** 서로 비교 가능한 값이 됨 (다른 요청으로 나눠 호출하면 기준선(100)이 달라져 비교 불가). 대시보드 UI에서 "브랜드/경쟁사 최대 5그룹 선택" 형태의 그룹 구성 UI가 필요.

## 4. 제안 백엔드 구조 (권한 발급 후)

기존 `src/lib/backend/` 패턴([sitemapCrawlJobRunner.ts](../src/lib/backend/sitemapCrawlJobRunner.ts), [collectionJobRunner.ts](../src/lib/backend/collectionJobRunner.ts))을 따라:

- `src/lib/backend/searchTrendJobTypes.ts` — 잡 요청/상태 타입
- `src/lib/backend/searchTrendJobRunner.ts` — DataLab API 호출, 하루 1,000회 한도 카운팅/백오프 포함
- `src/lib/backend/searchTrendReader.ts` — 저장된 결과 조회
- `src/app/api/search-trend/start/route.ts`, `.../status/route.ts` — 기존 `collection-runs`/`sitemap-crawl` API 라우트와 동일한 start/status 패턴

인증 정보는 환경변수로 관리:

```bash
# .env.local (커밋 금지)
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

코드에서는 `process.env.NAVER_CLIENT_ID` / `process.env.NAVER_CLIENT_SECRET`만 참조하고, 값 자체는 절대 로그·응답에 노출하지 않음. 이 두 값은 이미 네이버 통합검색 랭킹 수집(`collect-naver-ai.mjs`)과는 무관한 별도의 오픈 API 키이므로, 데이터랩 앱 등록 시 "데이터랩(검색어트렌드)" 권한만 별도로 추가해야 함(다른 API와 클라이언트 아이디를 공유할 수도, 새로 발급받을 수도 있음 — 발급 시점에 결정).

## 5. 제안 대시보드 화면

`src/app/search-trend/` (신규) — 기존 `search-collection` 페이지와 형제 구조:

- 상단: 그룹 구성 폼 (그룹명 + 키워드 최대 20개, 최대 5그룹), 기간(startDate/endDate), 단위(일/주/월), 선택 필터(디바이스/성별/연령)
- 본문: `MultiLineChart` 재사용해 그룹별 `ratio` 추이를 라인 차트로 표시 (기존 [MultiLineChart.tsx](../src/components/charts/MultiLineChart.tsx) 패턴)
- 하단: LLM 언급량(Prompt Research 데이터)과 같은 기간 축을 겹쳐 보여주는 비교 뷰 — "검색 트렌드 상승 시점과 LLM 언급 증가 시점의 시차" 같은 인사이트 제공이 목표

## 6. 구현 순서 (권한 발급 후)

1. `.env.local`에 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 추가
2. `scripts/collect-naver-search-trend.mjs` — 단발성 CLI로 API 호출 검증 (기존 `collect-google-ai.mjs` 등과 동일한 스크립트 패턴)
3. `src/lib/db/types.ts`에 3번 섹션 타입 추가
4. `src/lib/backend/searchTrend*` 잡 러너 + API 라우트 (4번 섹션)
5. `src/app/search-trend/` 화면 + 컴포넌트 (5번 섹션)
6. Prompt Research 데이터와의 교차 분석 뷰는 별도 반복(iteration)으로 분리 — 우선 트렌드 단독 화면부터 검증 후 진행

## 7. 열린 질문 (권한 발급 시점에 결정)

- 하루 1,000회 한도를 어떻게 배분할지 (브랜드당 그룹 수 × 재조회 주기)
- 저장 방식: 매번 재조회 시 새 레코드로 append할지, 최신 값만 유지할지
- `ratio`가 상대값이라는 점을 UI에 어떻게 명시할지 (툴팁/안내 문구)

## 8. Semrush 대체 조합에서의 역할

기존에 "트렌드 수집"으로 불리던 부분(Semrush류 키워드 API의 검색량 추정)을 이 API와 GSC 조합으로 대체하는 전체 그림은 [gsc-search-analytics-plan.md §1 "Semrush류 API와의 결정적 차이"](./gsc-search-analytics-plan.md#semrush류-api와의-결정적-차이)에 정리. 요약하면 이 API는 "시장 전체에서 이 키워드가 뜨고 있는가(상대 관심도)"를, GSC는 "우리 사이트가 그 키워드에서 실제로 얼마나 노출/클릭되는가(자사 실측)"를 담당 — 두 값을 합쳐야 Semrush의 "검색량" 개념을 근사할 수 있고, "난이도(경쟁 강도)"는 둘 다로도 대체 불가하다는 제약은 그대로 남는다.
