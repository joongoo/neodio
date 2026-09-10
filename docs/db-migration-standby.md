# DB 마이그레이션 스탠바이 — 현재 상태 검토

마이그레이션에 착수하기 전에, 지금 화면들이 실제로 어떤 데이터 소스에 의존하고 있는지와
그 데이터가 어떤 모양인지를 먼저 정리한다. 이 문서는 코드를 바꾸지 않고 현재 상태만
기록한 "검토용" 문서다 — 실제 스키마/마이그레이션 스크립트는 여기서 합의된 뒤 별도로
작성한다.

## 1. 데이터가 지금 3개 계층으로 나뉘어 있다

| 계층 | 위치 | 특징 |
|---|---|---|
| **A. 인메모리 mock 시드** | `src/lib/db/data/*.ts`, `db.*` 네임스페이스(`src/lib/db/index.ts`)로 접근 | 코드에 박힌 상수 배열/객체. 서버 재시작하면 항상 같은 값으로 리셋된다. 클라이언트 컴포넌트도 `db`를 값으로 import하는 곳이 있어(`SearchTrendClient`, `PromptResearchClient`) 이 배럴(`src/lib/db/index.ts`)에는 **`node:fs`를 쓰는 모듈을 절대 넣으면 안 된다** — 브라우저 번들이 깨진다. |
| **B. 파일 기반 실 데이터 저장소** | `.tmp/*.json`, `.tmp/*/*.json` (전부 `.gitignore`됨) | 서버 프로세스 재시작에도 살아남는 유일한 "쓰기 가능한" 저장소. 브랜드 CRUD, 추적 토픽, 크롤 기록, 수집 로그, GSC 토큰 등 — 사실상 지금의 "DB"다. Node 파일시스템 직접 접근이라 서버 컴포넌트/route handler에서만 import 가능. |
| **C. 실시간 계산(파생) 데이터** | `src/lib/backend/collectionStatsReader.ts`의 `getReal*` 함수들 | 별도 저장 없이, 매 요청마다 B 계층(수집 로그 파일, 크롤 기록 파일)을 읽어 그 자리에서 집계한다. DB로 옮기면 이 계산 로직 자체는 그대로 두고 "쿼리"로 대체하거나, 배치로 미리 집계해 테이블에 채우는 두 가지 선택지가 있다. |

마이그레이션은 사실상 **B 계층 전체(그리고 필요하면 C 계층이 읽는 소스 파일들)를 실 DB
테이블로 옮기는 작업**이고, **A 계층(mock 시드)은 실 데이터 소스가 완전히 대체할 때까지
페이지별로 하나씩 은퇴시키는 작업**이다. 이 둘을 한 번에 하지 않아도 된다 — 지금도 두
계층이 "실 데이터 있으면 실 데이터, 없으면 mock" 패턴으로 공존하고 있다.

## 2. B 계층 — 지금 존재하는 파일 저장소 전체 목록 (= DB 테이블 후보)

| 파일/디렉토리 | 만드는 모듈 | 내용 | 비고 |
|---|---|---|---|
| `.tmp/brands-management-added.json` | `brandsManagementStore.ts` | 새로 추가된 브랜드 전체 레코드 (`ManagedBrand[]`) | |
| `.tmp/brands-management-patches.json` | 〃 | 브랜드id → 변경된 필드만 병합 저장 (`Record<brandId, Partial<ManagedBrand>>`) | mock 시드 브랜드(`brand-neodigm`, `brand-demo`)도 여기 patch로 덮어써진다 |
| `.tmp/brands-management-deleted.json` | 〃 | 삭제된 브랜드 id 목록 (`string[]`) | soft-delete 방식 |
| `.tmp/tracked-topics/*.json` | `trackedTopics.ts` | 프롬프트 전략/토픽에서 "추적" 눌러 만든 프롬프트 라이브러리 행 (파일 1개 = 행 1개) | |
| `.tmp/deleted-library-rows.json` | `deletedLibraryRows.ts` | 삭제된 프롬프트 라이브러리 **시드** 행 id 목록 | 시드는 코드에 있어 직접 못 지우므로 필터링 방식 |
| `.tmp/sitemap-crawl/*.json` | `scripts/crawl-sitemap.mjs` → `sitemapCrawlReader.ts`가 읽음 | 크롤 1회 = 파일 1개. `SitemapCrawlResult`(도메인, crawledAt, URL별 raw/rendered 비교, complexityScore, hasFaq, hasToc, imageAltCoverage 등) | 절대 덮어쓰지 않고 계속 쌓임 → "전/후 비교"의 근거 |
| `.tmp/content-audit-excluded.json` | `contentAuditExclusions.ts` | 지표(complexity/faq/toc/multimedia)별 제외 URL 목록 | |
| `.tmp/topic-opportunity-targets.json` | `topicOpportunityTargets.ts` | 토픽 문자열 → 타겟 URL 매핑 | |
| `.tmp/gsc-tokens/*.json` | `gscTokenStore.ts` | 브랜드별 GSC OAuth 토큰(refresh token 포함) | **민감정보** — DB로 옮길 때 암호화 필요 |
| `.tmp/naver-ai/*.json`, `.tmp/google-ai/*.json` | `scripts/collect-naver-ai.mjs` / `collect-google-ai.mjs` → `collectionRuns.ts`가 읽음 | 수집 1회 실행 = 파일 1개. `PromptRunSeed` 형태(쿼리, 모델, 마켓, 답변 텍스트, 인용) | 가시성 개요/개요/브랜드 가시성/기회의 "실 데이터"가 전부 이 두 폴더에서 나온다 — 가장 핵심적인 테이블 |

## 3. 페이지별 화면 구성 · 데이터 소스 현황

범례 — 🟢 실 데이터(B/C 계층) 우선, 없으면 mock 폴백 · 🟡 mock 전용(아직 실 데이터 경로
없음) · 🔵 이번 세션에 새로 추가된 화면.

| 페이지 | 주요 화면 구성 | 데이터 소스 |
|---|---|---|
| `/` 개요 | 콘텐츠 가시성 카드, 체크리스트, 통계 카드 5종, 감성/마켓 차트, 트래픽 추이, 최신 기회 3건 | 🟢 콘텐츠 가시성(크롤 기록) · 🟢 통계/감성/마켓(수집 로그) · 🟢 최신 기회(크롤+토픽 createdAt) · 🟡 트래픽 추이(mock 고정 — CDN/Analytics 필요) |
| `/visibility-overview` 가시성 개요 | 통계 카드, 모델별/마켓별 언급, 상위 프롬프트·토픽 기회·상위 브랜드·인용된 페이지·인용된 소스·소스 기회 7개 탭 | 🟢 전부 수집 로그 기반 실 데이터 (없으면 페이지 자체가 mock으로 폴백) |
| `/prompt-research` 프롬프트 리서치 | 키워드 검색 결과 테이블 | 🟡 mock 전용 (`promptResearchByTopic`) |
| `/search-trend` 검색어 트렌드 | 키워드 검색 순위 | 🟡 mock 전용 (`searchTrendByKeyword`) — 네이버 데이터랩 연동 대상 |
| `/search-performance` 검색 성과(GSC) | GSC 연결 카드, 쿼리/노출/클릭 표 | 🟢 실 GSC OAuth 토큰 있으면 실 데이터, 없으면 mock |
| `/collection-runs` 수집 로그 | 실행 로그 테이블, 분석 모달 | 🟢 `.tmp/naver-ai`, `.tmp/google-ai` 원본 그대로 |
| `/prompt-strategy` 프롬프트 전략 | GSC 커버리지 공백 + LLM 브레인스토밍 카드, 그룹별 추적 테이블 | 🟢 GSC 소스는 실 데이터 · 🟡 LLM 브레인스토밍은 고정 mock(`promptStrategyByOrg`) — LLM API 연동 대상 |
| `/prompt-library` 프롬프트 라이브러리 | 프롬프트 테이블, 브랜디드 비율/토픽 의도 일치도 카드 | 🟢 시드+추적+삭제 필터를 합친 실 목록 |
| `/brand-presence` 브랜드 가시성 | 마켓 트래킹, 프롬프트 지표, 데이터 인사이트, Share of Voice, 감성 무버 | 🟢 전부 수집 로그 기반 실 데이터 경로 있음 |
| `/url-inspector` URL 인스펙터 | URL 인용 조회 | 🟢 수집 로그 기반 |
| `/opportunities` 기회 목록 | 온사이트 콘텐츠 최적화 4종 + 콘텐츠 가시성 회복 + robots.txt + 토픽 기회 카드, 최신순 정렬 | 🟢 크롤 기록/robots.txt 실시간 fetch/토픽(수집 로그) 전부 실 데이터 |
| `/opportunities/{complexity,faq,toc,multimedia,content-recovery}` | URL 테이블(체크박스/일괄 재색인/제외), 전/후 비교, LLM 가이드는 준비중 placeholder | 🟢 크롤 기록(`.tmp/sitemap-crawl`) + 제외 목록 |
| `/opportunities/robots-txt` | robots.txt 파싱 결과 | 🟢 매 요청마다 실시간으로 `https://{domain}/robots.txt` fetch (저장 안 함) |
| `/opportunities/topic/[topic]` | 토픽 상세, 라이브러리 추가 여부, 타겟 URL 인용 트래킹, 수집 로그별 변화 | 🟢 수집 로그 + 타겟 URL 매핑 파일 |
| `/brands-management` 브랜드 설정 | 활성/대기 브랜드 카드(추가/삭제), 카테고리 표(생성/편집/삭제) | 🟢 브랜드는 실 파일 저장소 · 🟡 카테고리는 아직 로컬 state만(새로고침하면 사라짐 — 미해결) |
| `/brands-management/[brandId]` 브랜드 상세 | 기본 정보, URL/소셜/소스/별칭/기타 브랜드 목록, 사이트맵 크롤, 상태 전환 | 🟢 전부 실 파일 저장소에 patch 저장 |
| `/brands-management/[brandId]/connections` 연결 관리 | GSC 카드(실 연동), CDN/Analytics 카드(준비중 토스트만) | 🟢 GSC · 🟡 CDN/Analytics 미구현 |
| `/help`, `/help/[slug]` 🔵 도움말 및 학습 | 가이드 카드 목록 + 상세, 로드맵 섹션 | 🟡 전부 코드에 박힌 정적 콘텐츠(`help.ts`) — 이 페이지 자체는 DB 이관 대상이 아님(콘텐츠 관리가 필요해지면 그때 검토) |

## 4. mock 전용으로 남아있는 지점 (실 데이터 연동 대상)

1. **트래픽 추이** (`/` 개요) — CDN/Analytics 연동 전까지 mock.
2. **프롬프트 리서치, 검색어 트렌드** — 각각 별도 API(리서치 소스, 네이버 데이터랩) 연동 전까지 mock.
3. **프롬프트 전략의 LLM 브레인스토밍 소스** — LLM API 연동 전까지 고정 mock.
4. **카테고리 CRUD** (`/brands-management`) — 브랜드와 달리 아직 파일 저장소에 연결 안 됨. **DB 마이그레이션과 무관하게 지금도 고칠 수 있는 항목** — 우선순위 낮은 버그로 남겨둔 상태.
5. **소스 기회 추천/reasoning** — LLM 응답을 사람이 `sourceOpportunityRecommendations.ts`에 수동으로 붙여넣는 다리 단계.

## 5. 제안 스키마 — 대략적인 테이블 그룹

세부 컬럼/타입은 `src/lib/db/types.ts`의 대응 interface를 그대로 옮기면 되므로 여기서는
테이블 그룹과 관계만 잡는다. (`*`는 이미 organizationId/brandId 형태의 FK를 갖고 있어
그대로 옮기기 쉬운 것.)

- **조직/사용자** (신규) — `organizations`\*, `users`, `org_members`(역할 포함) — 3-2번 회원 체계 작업과 함께 설계.
- **브랜드** — `brands`\*(`ManagedBrand` 기준, status/aliases/otherBrands/urls/socialAccounts/earnedContentSources는 각각 정규화할지 JSON 컬럼으로 둘지 결정 필요), `categories`\*.
- **수집 파이프라인** — `prompt_runs`\*(현재 `.tmp/naver-ai`, `.tmp/google-ai` 파일 1개=1행), `mentions`, `citations` — 지금은 `processPromptRuns()`가 매 요청마다 파일을 읽어 이 두 개를 즉석에서 계산한다. DB로 옮기면 수집 스크립트가 직접 `mentions`/`citations` 테이블에 insert하도록 바꿀지, 계속 `prompt_runs`에서 파생 계산할지 결정 필요.
- **프롬프트 라이브러리** — `prompt_library_rows`\*(시드 삭제 필터 로직은 실제 삭제로 대체), `tracked_topics` merge 대상.
- **크롤/기회** — `sitemap_crawls`(크롤 1회=1행, 지금 파일 구조와 거의 동일), `content_audit_exclusions`, `topic_opportunity_targets`.
- **연동 토큰** — `oauth_tokens`(GSC 등, **암호화 컬럼 필수**).
- **소스 기회 추천** — `source_recommendations` (도메인 → 추천/근거, 지금 수동 파일).

## 6. 마이그레이션 착수 전 결정해야 할 것 (스탠바이 체크리스트)

- [ ] DB 엔진/ORM 선택 (예: Postgres + Prisma/Drizzle)
- [ ] 멀티테넌시 전략 — 지금 `DEFAULT_ORG_ID` 하나로 고정된 부분을 전부 실제 `organizationId` 파라미터로 바꿔야 함 (회원 체계 작업과 순서 조율 필요)
- [ ] `prompt_runs`/`mentions`/`citations`를 collector 스크립트가 직접 쓸지, 계속 파일 → 배치 적재로 갈지
- [ ] GSC 토큰 등 민감정보 암호화 방식
- [ ] 파일 → DB 백필 스크립트 필요 여부 (지금 `.tmp` 데이터를 살릴지, 새로 시작할지)
- [ ] `src/lib/db/index.ts`(mock 배럴)를 어떻게 걷어낼지 — 클라이언트 컴포넌트가 값으로 import하는 지점(`SearchTrendClient`, `PromptResearchClient`)부터 실 API 호출로 먼저 바꿔야 배럴을 지울 수 있음
