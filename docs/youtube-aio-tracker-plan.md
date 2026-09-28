# YouTube AIO 인용 트래커 기획

> 상태: **Phase 0~4 구현 완료 (MVP)**, Phase 5(부가) 미착수. 구현 현황은 §9. 요구사항 원본은 루트의
> `AIO 인용 트래커 — 요구사항 및 대시보드 구성안.pdf`, 화면 시안은
> `AIO 인용 트래커 대시보드 1.pdf` 2p(전체 현황)·3p(키워드 상세).

## 1. 목적

고객 브랜드(첫 대상: Salesforce)의 **YouTube 채널 영상**이 Google 일반 검색
결과 상단의 **AI Overview(AIO)**에 인용되는지 키워드 단위로 매일 추적하고,
영상 AIO 최적화 작업(자막·챕터·설명란)의 효과를 전후 비교로 보여준다.

SEMrush(고비용)·VIVI(프롬프트당 과금)는 도메인 단위 인용만 잡아서 "YouTube
영상 중 **우리 채널** 영상이 인용됐는가"를 알 수 없다 — 이 트래커는 인용
판정을 **채널 ID 기준**으로 한다.

## 2. 핵심 질문과 지표

| 질문 | 판정 |
|---|---|
| Q1. AIO가 뜨는가? | SERP에 AIO 블록 존재 |
| Q2. YouTube가 인용되는가? | AIO 인용 링크 중 youtube.com / youtu.be 존재 |
| Q3. 우리 채널 영상이 인용되는가? | 영상 ID → 채널 ID가 브랜드 등록 채널과 일치 (순서·타임스탬프 기록) |

| 지표 | 계산식 |
|---|---|
| AIO 노출률 | AIO가 뜬 키워드 ÷ 추적 키워드 |
| YouTube 인용률 | YouTube가 인용된 AIO ÷ AIO가 뜬 키워드 |
| **채널 인용률 (핵심)** | 우리 영상이 인용된 AIO ÷ **AIO가 뜬 키워드** |
| 인용 점유율(SoV) | 우리 영상 인용 수 ÷ 전체 인용 링크 수 |
| 평균 인용 순서 | 인용 목록에서 우리 영상의 평균 위치 |
| 인용 유지율 | 최근 7일 중 우리 영상이 인용된 날 비율 (시안 3p) |

- 분모는 "AIO가 뜬 키워드" — AIO 미노출을 최적화 실패로 오해하지 않도록.
- 기존 원칙 유지: 0%와 미측정(–) 구분, 설정 변경(채널 추가 등)은 다음 수집분부터 반영(비소급).

## 3. 기존 구조와의 관계

- **브랜드 컨텍스트**: 새 페이지만 헤더의 선택 브랜드(`selected-brand` 쿠키)를
  따른다(범위 A). 기존 페이지는 계속 `DEFAULT_BRAND_ID` 기준. 선택 브랜드 →
  brandId 헬퍼는 나중에 전 페이지로 확장 가능하게 만든다.
- **수집기**: 기존 [collect-google-ai.mjs](../scripts/collect-google-ai.mjs)는
  `udm=50` = **AI Mode** 화면이다. AIO는 일반 SERP(`udm` 없음)의 다른 블록이라
  별도 수집 모드가 필요. 실제 Chrome(시크릿·CDP) 방식과 `/goto` 리다이렉트
  해제 로직은 재사용.
- **판정 결과**: 기존 `prompt_runs → run_analyses → citations`에 끼우지 않고
  AIO 전용 테이블(`brand_id` 기준)로 분리 — 결과 상태가 "AIO 없음"을 정상값으로
  가져야 하고 디바이스·국가 차원이 추가되기 때문.
- **화면 스타일**: 시안은 레이아웃만 참조, 색·톤은 기존 앱(neutral) 기준.
  KPI 카드는 [StatCard](../src/components/overview/StatCard.tsx)에 옵션(분수
  보조문구, %p 비교, 강조)을 추가해 재사용.

## 4. 브랜드 관리 추가 항목

연결 관리(`/brands-management/[brandId]/connections`)에 GSC 카드와 같은 형태로:

- **YouTube 채널 카드 (필수)**: 채널 URL/@핸들 입력 → YouTube Data API로 채널
  ID(UC…)·채널명·썸네일 조회 후 저장. 복수 채널. API 키만 사용(OAuth 불필요).
- **AIO 추적 설정 (선택, 기본값 있음)**: 수집 국가·언어·디바이스(기본 KR·ko·모바일),
  최적화 기준일(대시보드 "비교 기준" 기본값).
- 인용 소스 분류는 기존 브랜드 설정 재사용: 자사 웹 = 기본 URL·브랜드 URL,
  경쟁사 = 기타 브랜드, 그 외 = 블로그·미디어.

키워드 추가·그룹 지정과 영상 최적화 작업 이력은 설정이 아닌 운영 데이터이므로
새 페이지 안에서 관리한다.

## 5. 새 페이지 진입 안내

AI 가시성 → **YouTube AIO 인용** (전체 현황 + 키워드 상세). 설정 상태 기반으로
판단(한 번 닫으면 사라지는 방식 아님):

| 상태 | 화면 |
|---|---|
| YouTube 채널 미연동 | "YouTube 채널 연동 필요" 카드 + [연동하러 가기] → 선택 브랜드의 연결 관리 YouTube 카드. 본문 숨김 |
| 키워드 0개 | "추적할 키워드를 추가하세요" + [키워드 추가] |
| 수집 전 | 본문 표시, 지표 "–" + "첫 수집 대기 중" |
| 선택 항목 누락(경쟁사 등) | 본문 정상 + 가벼운 배너 |
| Demo 브랜드 | 연동 체크 없이 시안 샘플 데이터 |

## 6. 단계

| Phase | 내용 |
|---|---|
| 0. 검증 | 한국 로그아웃 상태 AIO 노출 여부, YouTube 인용 링크 형태(`watch?v=`·`youtu.be`·`t=`), 수집 방식(자체 크롤링 vs SERP API) 결정 |
| 1. 브랜드 관리 | 선택 브랜드 헬퍼, YouTube 채널 카드, AIO 추적 설정, Salesforce 브랜드 등록 |
| 2. 수집·판정 | AIO 수집 모드(국가·언어·디바이스), YouTube 판정(영상 → 채널 ID 캐시), 소스 5분류, 스냅샷 보관 |
| 3. DB | AIO 키워드, 관측 결과, 영상 캐시, 최적화 작업 이력 (`brand_id` 기준) |
| 4. 화면 | 사이드바 메뉴, 진입 안내, 전체 현황(시안 2p), 키워드 상세(시안 3p), Demo 샘플 데이터, 도움말 |
| 5. 부가 | 변화 알림(Slack 웹훅), SF 근거 문장 하이라이트, 키워드 제안, 스냅샷 내보내기 |

## 7. 열린 결정

- **수집 방식**: 자체 크롤링은 무료지만 단일 IP 캡차 위험(기존 스케줄러가 키워드당
  3~8분 간격 → 120개×2디바이스면 하루 약 22시간). SERP API(DataForSEO·SerpApi 등)는
  건당 과금이지만 AIO references를 구조화해 반환 — 요금·한국 AIO 지원은 확인 필요.
  수집 모듈은 어댑터 구조로 만들어 교체 가능하게 한다.
- **스냅샷 저장소**: 로컬 디스크 / 오브젝트 스토리지 / HTML만 DB.
- **고객 제공 정보**: Salesforce YouTube 채널(복수 여부), 초기 키워드, 경쟁사 목록.

## 8. Phase 0 검증 결과 (2026-09-28)

로그아웃 시크릿 Chrome(CDP), `google.com/search?q=…&hl=ko&gl=kr`, PC, 한국 IP.

| 키워드 | AIO | 출처 수 | YouTube 인용 |
|---|---|---|---|
| Slack 세일즈포스 연동 | O | 6 | 0 |
| 세일즈포스 에이전트포스란 | O | 6 | 0 |
| 영업 파이프라인 관리 방법 | O | 10 | 4 (t=358, t=50 등) |
| CRM 도입 절차 | O | 5 | 1 (t=322) |
| CRM 추천 | O | 5 | 0 |
| Salesforce vs HubSpot | O | 11 | 3 (Shorts 2건 포함) |
| AI 에이전트 CRM | O | 9 | 0 |
| 세일즈포스 가격 | O | 8 | 0 |
| how to connect slack to salesforce | O | 4 | 1 |
| what is agentforce | — | — | **캡차** |

- **한국 로그아웃 상태에서 AIO는 잘 뜬다** (9/9). YouTube는 4/9 키워드에서 인용 —
  인용된 9개 영상 모두 Salesforce 채널(`@salesforce` UCUpquzY878NEaZm5bc7m2sQ,
  `@SalesforceKorea` UChfQakBgx0dcJWAwjIhcc7A)이 아닌 타 채널 → "대신 인용된 소스"
  정보가 실제로 의미 있음.
- **인용 링크**는 AI Mode와 같은 `google.com/goto?url=` 래퍼. 브라우저 밖 `fetch`
  (redirect: manual)로 `Location`을 읽어 해제 가능 → 수집과 판정 분리 가능.
- **YouTube 링크 형태**: `watch?v=…&t=358`(초 단위 타임스탬프), `watch?v=…&vl=ko&t=…`,
  `/shorts/…`. 타임스탬프로 "인용 구간" 표시 가능.
- **DOM 구조**
  - 소스 패널: `aria-label="<제목>. 새 탭에서 열립니다."` 링크가 노출 순서대로 → 인용 순서.
  - 문장별 인용 칩: 문단 안 `aria-label="<사이트명>"` 링크(같은 goto 토큰) →
    **SF 근거 문장 하이라이트 구현 가능**.
  - "더보기"로 접힌 본문도 DOM에 이미 있어 펼치지 않아도 전체 텍스트를 읽을 수 있음.
  - 클래스명은 난독화(`Fzsovc`, `NMq1me` 등)라 셀렉터는 텍스트("AI 개요")·aria 기반으로.
- **채널 조회는 API 키 없이도 가능**: 채널 페이지 canonical, 영상 페이지 `videoDetails.channelId`.
  키가 있으면 공식 Data API 사용([src/lib/backend/youtube.ts](../src/lib/backend/youtube.ts)).
- **캡차**: 20~40초 간격으로 **10번째 요청에서 캡차**. 자체 크롤링은 기존 스케줄러처럼
  키워드당 3~8분 간격이 필요 → 하루 약 150~250회가 현실적 상한(키워드 × 디바이스).
  키워드 100개 이상 × 2디바이스를 안정적으로 돌리려면 SERP API 또는 IP 분산 필요.
- **미검증**: 모바일 SERP의 AIO 구조(캡차로 중단) — 캡차 해제 후 재검증.

**결론**: 수집기는 어댑터 구조로 만들고, 우선 기존 방식(실제 Chrome) 어댑터로 구현한다.
키워드 규모가 확정되면 SERP API 어댑터 추가 여부를 결정한다.

## 9. 구현 현황 (2026-09-28)

| 영역 | 파일 |
|---|---|
| 브랜드 관리 — YouTube 채널 카드, AIO 추적 설정 | [YoutubeChannelsCard](../src/components/brands-management/YoutubeChannelsCard.tsx), [AioSettingsCard](../src/components/brands-management/AioSettingsCard.tsx), [brandAioConfig.ts](../src/lib/backend/brandAioConfig.ts), API `brands/[brandId]/youtube-channels`·`aio-settings` |
| 선택 브랜드 헬퍼 (범위 A) | [selectedBrand.ts](../src/lib/backend/selectedBrand.ts) |
| 수집기 (AIO, 실제 Chrome) | [collect-google-aio.mjs](../scripts/collect-google-aio.mjs), 추출 [lib/aio-extract.mjs](../scripts/lib/aio-extract.mjs), Chrome 공용 [lib/incognito-chrome.mjs](../scripts/lib/incognito-chrome.mjs) |
| 수집 회차 (공용) | [aio/collector.ts](../src/lib/backend/aio/collector.ts) — 정기 수집과 수동 수집이 같은 코드 |
| 정기 수집 러너 | [collect-aio.ts](../scripts/collect-aio.ts) — `npm run collect:aio` (키워드 간 3~8분) |
| 수동 수집 ("지금 수집") | [aio/jobRunner.ts](../src/lib/backend/aio/jobRunner.ts), API `youtube-aio/collect`(POST 시작·GET 상태·DELETE 중단), [AioCollectButton](../src/components/youtube-aio/AioCollectButton.tsx) — 전체/키워드 단위, 키워드 간 1~2분, 동시 1건 |
| 판정 · 저장 · 지표 | [aio/judge.ts](../src/lib/backend/aio/judge.ts), [aio/store.ts](../src/lib/backend/aio/store.ts), [aio/metrics.ts](../src/lib/backend/aio/metrics.ts), [youtube.ts](../src/lib/backend/youtube.ts) |
| 화면 | `/youtube-aio`(전체 현황), `/youtube-aio/[keywordId]`(키워드 상세), 연동 안내 [YoutubeAioSetupGate](../src/components/youtube-aio/YoutubeAioSetupGate.tsx), Demo 샘플 [data/youtubeAio.ts](../src/lib/db/data/youtubeAio.ts), 도움말 `youtube-aio` |
| DB | `brand_youtube_channels`, `brand_aio_settings`, `aio_keywords`, `aio_observations`, `aio_citations`, `youtube_videos`, `aio_video_work_logs` ([schema.ts](../src/lib/backend/database/schema.ts)) — 브랜드 삭제 시 CASCADE |
| 테스트 | `npm run test:unit`(URL 파싱·판정·지표), `npm run test:db`에 [aio/store.test.ts](../src/lib/backend/aio/store.test.ts) 추가 |

**운영 방법**: 브랜드 관리 > 연결 관리에서 채널 연결 → YouTube AIO 인용 화면에서 키워드 추가 →
서버(실제 Chrome 설치된 VPS)에서 cron으로 `npm run collect:aio` 실행. 캡차가 뜨면 그날 수집을 멈추고,
다음 실행 때 남은 키워드부터 이어서 수집한다(오늘 수집분은 건너뜀, `--force`로 재수집).

**계획과 달라진 점**
- KPI 카드는 StatCard 확장 대신 페이지 전용 카드 — StatCard는 "지난주 대비 %" + 스파크라인에 묶여 있어
  분수 보조문구·%p·강조 카드를 넣으면 공용 타입이 흐려진다.
- 문장 하이라이트는 Phase 5에서 MVP로 당김 — Phase 0에서 문장별 인용 칩이 DOM에 있음을 확인.
- 기간 필터는 다른 화면과 같은 1주/2주/4주(`DateRange`, 기본 4주). 2주 이하는 추이를 일 단위로 보여준다.
- "스냅샷 내보내기"는 키워드 표 CSV. 수집 당시 화면은 키워드 상세의 "수집 당시 화면 보기"(PNG).

**남은 것 / 결정 필요**
- 모바일 SERP의 AIO 구조는 라이브로 미검증(검증 시점에 IP가 캡차 상태). 모바일 에뮬레이션·캡차 감지는 확인됨.
- 스냅샷(PNG/HTML)은 수집 서버의 `.tmp/google-aio/<brandId>/`에만 있다 — 수집 서버와 웹 서버가 다르면
  오브젝트 스토리지 이관 필요(§7).
- 키워드 규모가 하루 150~250회를 넘으면 SERP API 어댑터 추가(§7).
- Phase 5: 변화 알림, 키워드 제안, 경쟁사 도메인 직접 등록(지금은 경쟁사 영문 이름을 도메인 라벨로 대조).
