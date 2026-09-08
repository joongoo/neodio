# Google Search Console (Search Analytics API) 연동 기획

> 상태: **기획 단계**. GSC는 [neodigm_p0_scope.md](../neodigm_p0_scope.md) §1에서 이미 P0로 승격되어 있고
> ([src/lib/db/types.ts:464](../src/lib/db/types.ts:464)의 `GscConnection`, [src/components/brands-management/GscConnectionCard.tsx](../src/components/brands-management/GscConnectionCard.tsx)로 화면은 mock 구성되어 있음),
> 실제 OAuth 연동과 데이터 수집 배치는 아직 미구현. 이 문서는 그 실제 연동 범위를 정리한다.

## 1. API 개요 (요약)

- 사용 API: **Search Console API → `searchanalytics.query`** (Semrush 같은 유료 3rd-party 키워드 API와 달리, **우리 소유 property의 실측 데이터**만 조회 가능)
- 엔드포인트: `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`
- 인증: **OAuth 2.0** (API 키 방식 불가) — 브랜드 소유자가 Manage Connections 화면에서 자기 GSC 계정으로 로그인/동의해야 함. 서버는 발급받은 `refresh_token`을 브랜드 단위로 저장해 매 배치마다 access token을 재발급받아 호출.
- 요청 파라미터 핵심: `startDate`/`endDate`(yyyy-mm-dd), `dimensions`(예: `["query"]`, `["query","page"]`, `["query","date"]`), `rowLimit`(최대 25,000), `dimensionFilterGroups`(선택 필터)
- 응답: `rows[]`로 조합된 dimension 값들 + **`clicks`(클릭 수), `impressions`(노출 수), `ctr`(클릭률), `position`(평균 노출 순위)**
- 데이터 지연: 공식적으로 **2~3일 지연**이 있음 (당일/전일 데이터는 아직 없을 수 있음) — [neodigm_data_collection_pipeline.md §3.7](../neodigm_data_collection_pipeline.md) 참고, 이미 "일 1회 배치"로 설계돼 있음
- 호출 한도: 프로젝트당 쿼터 존재하지만 일반적인 배치 규모에서는 문제되지 않음 (Google Cloud Console에서 쿼터 상향 가능)

### Semrush류 API와의 결정적 차이

| | Semrush(3rd-party 키워드 API, 드롭됨) | GSC(자사 실측) | 네이버 DataLab(자사 무관 트렌드) |
|---|---|---|---|
| 데이터 범위 | 전체 웹의 임의 키워드 | **우리 도메인**에 실제로 노출/클릭된 쿼리만 | 네이버 통합검색 전체의 상대적 관심도(도메인 무관) |
| 값 종류 | 절대 추정치(검색량/난이도) | 절대 실측치(clicks/impressions/position) | **상대 지수(0~100)**, 절대량 아님 |
| 인증/비용 | 유료 구독 API 키 | 무료, OAuth(브랜드 계정 동의) | 무료, 클라이언트 아이디/시크릿 |
| 우리 프로젝트 상태 | P0 제외([neodigm_p0_scope.md](../neodigm_p0_scope.md) §2) | 이미 P0 승격, 화면 mock 존재 | 별도 기획([naver-datalab-search-trend-plan.md](./naver-datalab-search-trend-plan.md)) |

즉 Semrush가 하던 "이 토픽/키워드가 시장에서 얼마나 검색되는가(검색량)"와 "우리가 그 키워드에서 얼마나 노출/클릭되는가(성과)"라는 두 질문을, **네이버 DataLab(시장 관심도, KR 한정) + GSC(자사 실측 성과, 전 세계/전 검색엔진 공통)** 조합으로 대체하는 것이 이번 기획의 핵심 아이디어.

## 2. 이 프로젝트의 기존 구조와의 연결점

- `GscConnection` 타입 ([src/lib/db/types.ts:468](../src/lib/db/types.ts:468))은 이미 존재 — `status`, `accountEmail`, `property`, `lastSyncedAt`, `syncedQueries/Impressions/Clicks` 필드. **OAuth 연동 이후 이 타입을 채우는 배치**를 만들면 됨.
- `StrategySource = "gsc" | "llm_brainstorm"` ([src/lib/db/types.ts:706](../src/lib/db/types.ts:706))과 [src/lib/db/data/promptStrategy.ts](../src/lib/db/data/promptStrategy.ts)는 이미 GSC 노출수(`gscImpressions`)를 프롬프트 전략 추천의 근거로 쓰는 형태로 mock 되어 있음 — 실 데이터만 꽂으면 화면은 그대로 작동.
- `TopicRow`의 `searchVolume`/`difficulty`는 P0에서 드롭됐지만([src/lib/db/types.ts:293](../src/lib/db/types.ts:293)), **재도입 시** 다음처럼 재정의 제안:
  - `searchVolume` → Semrush 절대 추정치 대신, **네이버 DataLab `ratio`(한국 시장 상대 관심도)** 또는 **GSC `impressions`(자사 관측 노출)** 중 데이터가 있는 쪽을 표시 (툴팁으로 출처·상대/절대 여부 명시)
  - `difficulty`(0~100 난이도 점수)는 Semrush 고유의 경쟁 강도 추정치라 GSC/DataLab 어느 쪽으로도 대체 불가 — **P0 계속 제외 유지**, `position`(GSC 평균 노출 순위)으로 "우리가 이미 어디쯤 있는지"는 보여줄 수 있지만 "새 키워드의 경쟁 강도 예측"은 별도 3rd-party 없이는 불가능함을 명시

## 3. 제안 데이터 모델

```ts
// src/lib/db/types.ts 에 추가할 형태 (제안)
export interface GscSearchAnalyticsRow {
  query: string;
  page?: string;
  date?: string;       // dimensions에 "date" 포함 시
  clicks: number;
  impressions: number;
  ctr: number;          // 0~1
  position: number;     // 평균 노출 순위 (낮을수록 상위)
}

export interface GscSearchAnalyticsResult {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  rows: GscSearchAnalyticsRow[];
  collectedAt: string;  // 배치 실행 시각(ISO)
}
```

## 4. 제안 백엔드 구조

기존 `src/lib/backend/` 패턴을 따라, OAuth가 필요한 첫 소스이므로 토큰 관리 계층이 추가로 필요:

- `src/lib/backend/gscOAuth.ts` — 인증 URL 생성, `code` → `access_token`/`refresh_token` 교환, 브랜드별 `refresh_token` 저장/갱신
- `src/lib/backend/gscSearchAnalyticsJobTypes.ts` — 잡 요청/상태 타입
- `src/lib/backend/gscSearchAnalyticsJobRunner.ts` — 일 1회 배치, 브랜드별 property에 대해 `searchanalytics.query` 호출 (지연 고려해 `endDate`를 오늘-3일로 설정)
- `src/lib/backend/gscSearchAnalyticsReader.ts` — 저장된 결과 조회
- `src/app/api/connections/gsc/oauth/start/route.ts`, `.../callback/route.ts` — Manage Connections 화면의 "연결하기" 버튼이 트리거하는 OAuth 플로우
- `src/app/api/gsc-search-analytics/status/route.ts` — 배치 상태 조회 (기존 `collection-runs`/`sitemap-crawl` status 패턴)

인증 정보는 환경변수로 관리 (OAuth 클라이언트 자체는 앱 단위, 브랜드별 `refresh_token`만 DB에 암호화 저장):

```bash
# .env.local (커밋 금지)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://.../api/connections/gsc/oauth/callback
```

## 5. 대시보드 반영 지점 (신규 화면 없이 기존 화면 데이터 실체화)

GSC는 새 화면을 만들 필요 없이, 이미 mock으로 구성된 기존 화면들에 실 데이터를 꽂는 작업:

1. **Manage Connections → GSC 탭** ([GscConnectionCard.tsx](../src/components/brands-management/GscConnectionCard.tsx)) — `status`/`syncedQueries/Impressions/Clicks`를 실제 OAuth 연동 결과로 교체
2. **Prompt Strategy** ([PromptStrategyClient.tsx](../src/components/prompt-strategy/PromptStrategyClient.tsx)) — `gscImpressions` 컬럼과 "coverage_gap" 추천 로직(우리 프롬프트에 없는데 노출은 있는 쿼리)을 실 데이터로 계산
3. (선택, 재도입 시) **Visibility Overview 토픽 테이블**의 `searchVolume` — 위 2번 항목 "difficulty 대체 불가" 제약을 유지한 채로만

## 6. 구현 순서

1. Google Cloud Console에서 OAuth 2.0 클라이언트 등록(승인된 리디렉션 URI 포함) + Search Console API 활성화
2. `.env.local`에 `GOOGLE_OAUTH_CLIENT_ID`/`SECRET`/`REDIRECT_URI` 추가
3. `src/lib/backend/gscOAuth.ts` — 인증 플로우 + 토큰 저장(암호화)
4. `scripts/collect-gsc-search-analytics.mjs` — 단발성 CLI로 저장된 refresh_token 하나에 대해 API 호출 검증
5. `src/lib/db/types.ts`에 3번 섹션 타입 추가, `GscConnection`을 실 데이터 스키마와 맞춰 보강
6. `src/lib/backend/gscSearchAnalytics*` 잡 러너(일 1회 배치) + API 라우트
7. Manage Connections/Prompt Strategy 화면을 mock 데이터 → 실 데이터로 전환

## 7. 열린 질문

- 브랜드가 여러 명일 때 OAuth 동의를 누가 하는지(브랜드 관리자 1인 vs 각자) — Manage Connections이 "브랜드별 연결"이므로 브랜드 소유자가 직접 로그인해야 함
- `refresh_token` 저장 방식(암호화 키 관리) — 지금 프로젝트에 시크릿 스토리지 계층이 없다면 이 작업 전에 먼저 필요
- 재도입 시 `searchVolume`을 DataLab/GSC 중 무엇으로 채울지, 데이터가 둘 다 없는 토픽(자사 미노출 + DataLab 미대상 키워드)은 어떻게 표시할지
