# GSC 연동과 추가 신호

| 항목 | 내용 |
| --- | --- |
| 분류 | 연동 명세 |
| 용도 | 이 주제의 구현 상태, 설계 근거, 다음 작업을 한 곳에서 확인 |
| 상태 | 검색 성과 조회 구현됨; 추가 신호는 항목별 확인 |
| 확인 기준 | 현재 동작은 연결된 코드와 운영 설정; 조사·기획은 작성 당시 근거 |

## 읽는 방법

먼저 각 섹션의 상태를 확인하세요. 구현된 기능과 후속 기획을 구분했으며, 상세한 현재 동작은 연결된 코드를 기준으로 합니다.

## 현재 구현 범위

- OAuth 연결은 `src/app/api/connections/gsc/oauth/` 라우트에서 처리하고, `gscSearchAnalyticsReader.ts`가 검색 성과를 실시간 조회한다. 별도 `gscSearchAnalyticsJobRunner`나 일일 저장 배치는 없다.
- 브랜드별 refresh token은 [`gscTokenStore.ts`](../../../src/lib/backend/gscTokenStore.ts)가 `bridge_entries`의 `gsc-tokens` 범위에 저장한다. 서버 전용 코드에서만 읽지만, **애플리케이션 수준 암호화는 구현돼 있지 않다.** 아래 초기 설계의 "암호화 저장" 설명은 현재 동작이 아니다. 운영 보안 점검에서 보완 여부를 결정해야 한다.
- 검색 성과 화면은 연결된 property의 실측 데이터를 읽는다. `device`·`country` 차원도 조회한다.
- URL Inspection은 `/api/gsc-url-inspection`, `searchAppearance`는 FAQ·목차 기회 화면, Sitemaps API는 robots.txt 기회 화면에서 사용한다. 추가 신호가 전부 미구현이라는 초기 조사 설명은 현재와 다르다.
- 아래 두 섹션의 `제안`·`추가할` 서술은 작성 당시 설계 기록이다. 현재 구현 여부는 위 코드와 각 화면 호출 경로를 기준으로 판단한다.

<a id="section-01"></a>

## 01. 검색 성과 연동

> 상태: OAuth 연결과 Search Analytics 조회가 구현돼 있다. 현재 동작은 [`gscSearchAnalyticsReader.ts`](../../../src/lib/backend/gscSearchAnalyticsReader.ts)와 [검색 성과 페이지](../../../src/app/[org]/[brand]/search-performance/page.tsx)를 기준으로 확인한다. 아래 내용은 연동 설계와 초기 결정 기록이다.

### 1. API 개요 (요약)

- 사용 API: **Search Console API → `searchanalytics.query`** (Semrush 같은 유료 3rd-party 키워드 API와 달리, **우리 소유 property의 실측 데이터**만 조회 가능)
- 엔드포인트: `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`
- 인증: **OAuth 2.0** (API 키 방식 불가) — 브랜드 소유자가 Manage Connections 화면에서 자기 GSC 계정으로 로그인/동의해야 함. 서버는 발급받은 `refresh_token`을 브랜드 단위로 저장해 매 배치마다 access token을 재발급받아 호출.
- 요청 파라미터 핵심: `startDate`/`endDate`(yyyy-mm-dd), `dimensions`(예: `["query"]`, `["query","page"]`, `["query","date"]`), `rowLimit`(최대 25,000), `dimensionFilterGroups`(선택 필터)
- 응답: `rows[]`로 조합된 dimension 값들 + **`clicks`(클릭 수), `impressions`(노출 수), `ctr`(클릭률), `position`(평균 노출 순위)**
- 데이터 지연: 공식적으로 **2~3일 지연**이 있음 (당일/전일 데이터는 아직 없을 수 있음) — [collection-pipeline-spec.md §3.7](../../data/collection-pipeline-spec.md#section-01) 참고, 이미 "일 1회 배치"로 설계돼 있음
- 호출 한도: 프로젝트당 쿼터 존재하지만 일반적인 배치 규모에서는 문제되지 않음 (Google Cloud Console에서 쿼터 상향 가능)

#### Semrush류 API와의 결정적 차이

| | Semrush(3rd-party 키워드 API, 드롭됨) | GSC(자사 실측) | 네이버 DataLab(자사 무관 트렌드) |
|---|---|---|---|
| 데이터 범위 | 전체 웹의 임의 키워드 | **우리 도메인**에 실제로 노출/클릭된 쿼리만 | 네이버 통합검색 전체의 상대적 관심도(도메인 무관) |
| 값 종류 | 절대 추정치(검색량/난이도) | 절대 실측치(clicks/impressions/position) | **상대 지수(0~100)**, 절대량 아님 |
| 인증/비용 | 유료 구독 API 키 | 무료, OAuth(브랜드 계정 동의) | 무료, 클라이언트 아이디/시크릿 |
| 우리 프로젝트 상태 | P0 제외([p0-scope-spec.md](../../product/p0-scope-spec.md) §2) | OAuth·실측 조회 구현 | 검색어 트렌드 조회 구현 |

즉 Semrush가 하던 "이 토픽/키워드가 시장에서 얼마나 검색되는가(검색량)"와 "우리가 그 키워드에서 얼마나 노출/클릭되는가(성과)"라는 두 질문을, **네이버 DataLab(시장 관심도, KR 한정) + GSC(자사 실측 성과, 전 세계/전 검색엔진 공통)** 조합으로 대체하는 것이 이번 기획의 핵심 아이디어.

### 2. 이 프로젝트의 기존 구조와의 연결점

- `GscConnection` 타입 ([src/lib/db/types.ts:468](../../../src/lib/db/types.ts))은 이미 존재 — `status`, `accountEmail`, `property`, `lastSyncedAt`, `syncedQueries/Impressions/Clicks` 필드. **OAuth 연동 이후 이 타입을 채우는 배치**를 만들면 됨.
- `StrategySource = "gsc" | "llm_brainstorm"` ([src/lib/db/types.ts:706](../../../src/lib/db/types.ts))과 [src/lib/db/data/promptStrategy.ts](../../../src/lib/db/data/promptStrategy.ts)는 이미 GSC 노출수(`gscImpressions`)를 프롬프트 전략 추천의 근거로 쓰는 형태로 mock 되어 있음 — 실 데이터만 꽂으면 화면은 그대로 작동.
- `TopicRow`의 `searchVolume`/`difficulty`는 P0에서 드롭됐지만([src/lib/db/types.ts:293](../../../src/lib/db/types.ts)), **재도입 시** 다음처럼 재정의 제안:
  - `searchVolume` → Semrush 절대 추정치 대신, **네이버 DataLab `ratio`(한국 시장 상대 관심도)** 또는 **GSC `impressions`(자사 관측 노출)** 중 데이터가 있는 쪽을 표시 (툴팁으로 출처·상대/절대 여부 명시)
  - `difficulty`(0~100 난이도 점수)는 Semrush 고유의 경쟁 강도 추정치라 GSC/DataLab 어느 쪽으로도 대체 불가 — **P0 계속 제외 유지**, `position`(GSC 평균 노출 순위)으로 "우리가 이미 어디쯤 있는지"는 보여줄 수 있지만 "새 키워드의 경쟁 강도 예측"은 별도 3rd-party 없이는 불가능함을 명시

### 3. 제안 데이터 모델

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

### 4. 제안 백엔드 구조

기존 `src/lib/backend/` 패턴을 따라, OAuth가 필요한 첫 소스이므로 토큰 관리 계층이 추가로 필요:

- `src/lib/backend/gscOAuth.ts` — 인증 URL 생성, `code` → `access_token`/`refresh_token` 교환, 브랜드별 `refresh_token` 저장/갱신
- `src/lib/backend/gscSearchAnalyticsJobTypes.ts` — 잡 요청/상태 타입
- `src/lib/backend/gscSearchAnalyticsJobRunner.ts` — 일 1회 배치, 브랜드별 property에 대해 `searchanalytics.query` 호출 (지연 고려해 `endDate`를 오늘-3일로 설정)
- `src/lib/backend/gscSearchAnalyticsReader.ts` — 저장된 결과 조회
- `src/app/api/connections/gsc/oauth/start/route.ts`, `.../callback/route.ts` — Manage Connections 화면의 "연결하기" 버튼이 트리거하는 OAuth 플로우
- `src/app/api/gsc-search-analytics/status/route.ts` — 배치 상태 조회 (기존 `collection-runs`/`sitemap-crawl` status 패턴)

초기 기획: OAuth 클라이언트 환경변수와 refresh token 암호화 저장을 제안했다. 실제 토큰 저장 방식은 위 "현재 구현 범위"를 따른다.

```bash
# .env.local (커밋 금지)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://.../api/connections/gsc/oauth/callback
```

### 5. 대시보드 반영 지점 (신규 화면 없이 기존 화면 데이터 실체화)

GSC는 새 화면을 만들 필요 없이, 이미 mock으로 구성된 기존 화면들에 실 데이터를 꽂는 작업:

1. **Manage Connections → GSC 탭** ([GscConnectionCard.tsx](../../../src/components/brands-management/GscConnectionCard.tsx)) — `status`/`syncedQueries/Impressions/Clicks`를 실제 OAuth 연동 결과로 교체
2. **Prompt Strategy** ([PromptStrategyClient.tsx](../../../src/components/prompt-strategy/PromptStrategyClient.tsx)) — `gscImpressions` 컬럼과 "coverage_gap" 추천 로직(우리 프롬프트에 없는데 노출은 있는 쿼리)을 실 데이터로 계산
3. (선택, 재도입 시) **Visibility Overview 토픽 테이블**의 `searchVolume` — 위 2번 항목 "difficulty 대체 불가" 제약을 유지한 채로만

### 6. 구현 순서

1. Google Cloud Console에서 OAuth 2.0 클라이언트 등록(승인된 리디렉션 URI 포함) + Search Console API 활성화
2. `.env.local`에 `GOOGLE_OAUTH_CLIENT_ID`/`SECRET`/`REDIRECT_URI` 추가
3. `src/lib/backend/gscOAuth.ts` — 인증 플로우 + 토큰 저장(암호화)
4. `scripts/collect-gsc-search-analytics.mjs` — 단발성 CLI로 저장된 refresh_token 하나에 대해 API 호출 검증
5. `src/lib/db/types.ts`에 3번 섹션 타입 추가, `GscConnection`을 실 데이터 스키마와 맞춰 보강
6. `src/lib/backend/gscSearchAnalytics*` 잡 러너(일 1회 배치) + API 라우트
7. Manage Connections/Prompt Strategy 화면을 mock 데이터 → 실 데이터로 전환

### 7. 열린 질문

- 브랜드가 여러 명일 때 OAuth 동의를 누가 하는지(브랜드 관리자 1인 vs 각자) — Manage Connections이 "브랜드별 연결"이므로 브랜드 소유자가 직접 로그인해야 함
- `refresh_token` 저장 방식(암호화 키 관리) — 지금 프로젝트에 시크릿 스토리지 계층이 없다면 이 작업 전에 먼저 필요
- 재도입 시 `searchVolume`을 DataLab/GSC 중 무엇으로 채울지, 데이터가 둘 다 없는 토픽(자사 미노출 + DataLab 미대상 키워드)은 어떻게 표시할지

<a id="section-02"></a>

## 02. 추가 API와 분석 신호

현재 `gscSearchAnalyticsReader.ts`는 Search Analytics의 `date`·`query`·`page`·`device`·`country`·`searchAppearance` 차원을 조회한다. URL Inspection과 Sitemaps API도 별도로 호출한다. 아래 §1은 현재 호출을 요약하고, §2는 **추가 연동을 검토하던 초기 조사 목록**이다. §2에서 "안 쓰는 것"으로 적힌 항목 중 구현된 것은 §4의 완료 목록을 우선한다.

### 1. 현재 호출

| API | 사용 위치 | 현재 조회 |
|---|---|---|
| Search Analytics | 검색 성과·프롬프트 전략·FAQ/목차 기회 | `date`, `query`, `page`, `device`, `country`, `searchAppearance`, `query`+`page` |
| URL Inspection | `/api/gsc-url-inspection` | URL별 인덱싱 상태 |
| Sitemaps | robots.txt 기회 화면 | 제출 사이트맵 상태 |

### 2. 초기 조사 당시 미사용 기능 목록 (현재 상태는 §1·§4 참조)

#### 2-1. 당시 미사용이던 `searchAnalytics.query` 옵션

- **`device` 차원** — DESKTOP/MOBILE/TABLET별 클릭·노출·CTR·순위
- **`country` 차원** — 국가별 클릭·노출
- **`searchAppearance` 차원** — FAQ 리치 결과, 사이트링크, AMP 등 리치 결과 유형별 실적
- **`type` 파라미터(searchType)** — 지금은 기본값(web)만. `discover`(구글 디스커버 피드), `googleNews`, `image`, `video`도 가능
- **결합 차원** — `["query","page"]`처럼 여러 dimension을 한 번에 묶어 조회 가능 (지금은 query/page를 항상 따로 조회)
- **`dimensionFilterGroups`** — 서버 사이드 필터(예: page가 특정 패턴인 것만). 지금은 전부 받아서 클라이언트 코드로 필터링
- **긴 날짜 범위** — API는 최대 16개월 지원. 지금은 4~5주만 봄

#### 2-2. 당시 호출하지 않던 다른 API

| API | 메서드 | 얻을 수 있는 것 |
|---|---|---|
| **URL Inspection API** | `urlInspection.index.inspect` | URL 단위 실제 구글 인덱싱 상태(verdict), 마지막 크롤 시각, robots.txt 차단 여부, 구글이 선택한 canonical vs 우리가 선언한 canonical, 모바일/데스크톱 크롤 여부, 이 URL이 등록된 사이트맵 목록 |
| **Sitemaps API** | `sitemaps.list` / `sitemaps.get` | 제출한 사이트맵별 마지막 다운로드 시각, 경고/에러 개수, 콘텐츠 타입별 "제출 수 대비 인덱싱 수" |
| **Sites API** | `sites.list` | 사이트 소유권/권한 레벨 (진단 가치는 낮음) |

### 3. 조합하면 의미가 생기는 것 (제안, 우선순위순)

#### ① URL Inspection(구글 인덱싱 상태) × 우리 크롤 콘텐츠 가시성 × 실제 AI 인용 여부 — 최우선
지금 "기회 > 콘텐츠 가시성 회복"은 **우리 자체 크롤(raw HTML vs 렌더링 비교)만** 근거로 삼는다. 여기에 URL Inspection의 실제 구글 인덱싱 상태를 더하면 URL별로 원인을 정확히 구분할 수 있다:

- 구글에 **인덱싱 자체가 안 됨** (robots.txt 차단, noindex, 크롤 안 됨) → 콘텐츠를 아무리 고쳐도 소용없음, 인덱싱 문제부터 해결
- **인덱싱은 됐는데** 우리 크롤 가시성 점수가 낮음 → 진짜 "AI가 렌더링을 못 읽는" 문제, 지금 기회 카드가 맞게 진단하고 있는 케이스
- **인덱싱도 되고 가시성도 좋은데** 아직 AI 답변에 인용 안 됨 → 크롤/인덱싱 문제가 아니라 순수 콘텐츠 품질·경쟁 문제

지금은 이 세 경우를 구분할 방법이 없어서 "가시성 회복" 기회가 다 같은 처방(재크롤)으로 뭉뚱그려진다.

#### ② `query`+`page` 결합 조회 × 토픽 기회 타겟 URL 추천
지금 "커버리지 공백" 키워드는 어느 페이지로 노출되는지 모른 채 키워드만 뽑는다. `["query","page"]`로 결합 조회하면 "이 키워드가 실제로 어떤 우리 페이지로 노출되는지"가 나와서, 토픽 기회 상세의 "콘텐츠 인용 트래킹" 타겟 URL을 사람이 직접 입력하지 않아도 자동 제안할 수 있고, LLM 프롬프트 생성 시에도 "이 페이지 내용을 참고해서 만들어라"는 근거를 줄 수 있다.

#### ③ `searchAppearance` × 콘텐츠 감사 기회(FAQ/목차 추가)의 효과 검증
"FAQ 추가"/"목차 추가" 기회는 지금 "만들면 좋을 것"이라는 가설만 있고, 실제로 검색결과에서 리치 결과(FAQ 스니펫, 사이트링크)로 노출되기 시작했는지 확인할 방법이 없다. `searchAppearance` 차원을 붙이면 "이 기회를 실행한 뒤 실제로 리치 결과 노출이 늘었는지"를 전/후 비교로 보여줄 수 있다 — 지금 있는 "재크롤 전/후 비교"와 같은 자리에 구글 검색결과 기준 전/후 비교를 나란히 놓을 수 있음.

#### ④ Sitemaps API(제출/인덱싱 수) × 우리 자체 크롤 URL 수
사이트맵에 제출한 URL 수, 구글이 실제 인덱싱한 수, 우리가 크롤해서 콘텐츠 가시성을 측정한 URL 수 — 이 세 숫자를 나란히 보여주면 "사이트맵엔 있는데 우리가 아직 안 크롤한 URL"이나 "사이트맵 자체가 에러나서 구글이 못 읽는 URL"을 새 기회로 발견할 수 있다. Sitemaps API의 에러/경고 카운트는 지금 "robots.txt로 차단된 트래픽" 카드 옆에 나란히 둘 좋은 정량 지표이기도 하다.

#### ⑤ `country` 차원 × 우리가 미리 정해둔 마켓(seedMarkets)
지금 마켓(한국/미국/영국/독일/전세계)은 우리가 임의로 고정한 값이라 실 데이터 근거가 없다. `country` 차원 실측을 붙이면 "실제로 어느 나라에서 이 도메인이 검색 노출되고 있는지"를 근거로 마켓 확장 우선순위를 정당화할 수 있다 (예: 미국 노출이 이미 늘고 있으면 미국향 프롬프트 세트부터 늘리는 게 근거 있는 결정이 됨).

#### ⑥ `device` 차원 × 콘텐츠 포맷 우선순위 (참고용, 우선순위 낮음)
모바일/데스크톱 검색 성과 차이는 AI 어시스턴트 사용 환경과 직접 연결되진 않지만, 콘텐츠를 짧은 요약형으로 갈지 긴 글로 갈지 정할 때 보조 참고 지표로 쓸 수 있다.

#### ⑦ 16개월 장기 데이터 × "최신 기회" 트렌드 판별 (참고용)
지금 4~5주만 보다 보니 일시적 스파이크와 지속적 트렌드를 구분 못 한다. 날짜 범위를 늘리면 개요의 "최신 기회"가 진짜 추세인지 일회성인지 판별하는 데 쓸 수 있지만, 급하지 않다.

### 4. 요약 — 지금 당장 붙일 가치 순서

1. ✅ **URL Inspection API** 연동 — 콘텐츠 가시성 회복 기회의 진단 정확도를 근본적으로 높임 (①) — 구현 완료, 5개 콘텐츠 기회 페이지 "구글 인덱싱" 컬럼
2. ✅ **`query`+`page` 결합 조회** — 파라미터만 바꾸면 되는 가장 싼 개선, 토픽 기회 타겟 URL 자동 제안에 바로 씀 (②) — 구현 완료, 프롬프트 전략 GSC 키워드 그룹에 타겟 페이지 힌트
3. ✅ **`searchAppearance` 차원** — 콘텐츠 감사 기회의 "효과가 있었나?" 질문에 처음으로 답을 줌 (③) — 구현 완료, FAQ/목차 기회 페이지 "구글 검색 결과 노출 유형" 섹션
4. ✅ **Sitemaps API** — robots.txt 기회 카드 옆에 정량 지표 하나 더 (④) — 구현 완료, robots.txt 기회 페이지 "사이트맵 상태" 섹션
5. ✅ **`country`/`device` 차원** (⑤,⑥) — 구현 완료, 검색 성과(GSC) 페이지에 기기별/국가별 표
6. 장기 기간(⑦)은 근거 보강용, 급하지 않아 보류

### 5. GSC 외 추가 연동 — PageSpeed Insights / Chrome UX Report API

Search Console과는 다른 API(OAuth 아닌 API 키 인증)지만 같은 진단 목적으로 붙였다.
페이지가 느리면 AI 크롤러도 렌더링 타임아웃으로 콘텐츠를 못 읽을 수 있어, "콘텐츠 가시성
회복" 기회의 우리 자체 크롤 점수·구글 인덱싱 상태 옆에 세 번째 근거로 추가했다.

- ✅ **PageSpeed Insights API** (`GOOGLE_PAGESPEED_API_KEY` 환경변수) — CrUX 실사용자 필드
  데이터가 있으면 그걸, 트래픽이 적어 없으면 Lighthouse 실험실 추정치를 반환. 5개 콘텐츠
  기회 페이지에 "페이지 속도" 컬럼으로 구현 완료 (`src/lib/backend/pageSpeedInsightsReader.ts`).
- Chrome UX Report API 자체를 별도 호출하진 않는다 — PageSpeed Insights API 응답의
  `loadingExperience` 필드가 이미 CrUX 데이터를 포함하므로 별도 호출이 불필요.
