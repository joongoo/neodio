# YouTube 인용·영상 추적

| 항목 | 내용 |
| --- | --- |
| 분류 | 기능 명세·후속 기획 |
| 용도 | 이 주제의 구현 상태, 설계 근거, 다음 작업을 한 곳에서 확인 |
| 상태 | AIO MVP 구현됨; 영상 추적 후속 단계는 본문 확인 |
| 확인 기준 | 현재 동작은 연결된 코드와 운영 설정; 조사·기획은 작성 당시 근거 |

## 읽는 방법

먼저 각 섹션의 상태를 확인하세요. 구현된 기능과 후속 기획을 구분했으며, 상세한 현재 동작은 연결된 코드를 기준으로 합니다.

<a id="section-01"></a>

## 01. AIO 인용 추적 MVP

> 상태: **Phase 0~4 구현 완료 (MVP)**, Phase 5(부가) 미착수. 구현 현황은 §9.
> 영상 관리 화면과 프롬프트 등록 경로가 추가돼 있다. 초기 확장 계획과 현재 구현의 차이는 [02. 영상 단위 추적 후속 계획](#section-02)에서 코드와 함께 확인한다. 요구사항 원본은 루트의
> `AIO 인용 트래커 — 요구사항 및 대시보드 구성안.pdf`, 화면 시안은
> `AIO 인용 트래커 대시보드 1.pdf` 2p(전체 현황)·3p(키워드 상세).

### 1. 목적

고객 브랜드(첫 대상: Salesforce)의 **YouTube 채널 영상**이 Google 일반 검색
결과 상단의 **AI Overview(AIO)**에 인용되는지 키워드 단위로 매일 추적하고,
영상 AIO 최적화 작업(자막·챕터·설명란)의 효과를 전후 비교로 보여준다.

SEMrush(고비용)·VIVI(프롬프트당 과금)는 도메인 단위 인용만 잡아서 "YouTube
영상 중 **우리 채널** 영상이 인용됐는가"를 알 수 없다 — 이 트래커는 인용
판정을 **채널 ID 기준**으로 한다.

### 2. 핵심 질문과 지표

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

### 3. 기존 구조와의 관계

- **브랜드 컨텍스트**: 새 페이지만 헤더의 선택 브랜드(`selected-brand` 쿠키)를
  따른다(범위 A). 기존 페이지는 계속 `DEFAULT_BRAND_ID` 기준. 선택 브랜드 →
  brandId 헬퍼는 나중에 전 페이지로 확장 가능하게 만든다.
- **수집기**: 기존 [collect-google-ai.mjs](../../../scripts/collect-google-ai.mjs)는
  `udm=50` = **AI Mode** 화면이다. AIO는 일반 SERP(`udm` 없음)의 다른 블록이라
  별도 수집 모드가 필요. 실제 Chrome(시크릿·CDP) 방식과 `/goto` 리다이렉트
  해제 로직은 재사용.
- **판정 결과**: 기존 `prompt_runs → run_analyses → citations`에 끼우지 않고
  AIO 전용 테이블(`brand_id` 기준)로 분리 — 결과 상태가 "AIO 없음"을 정상값으로
  가져야 하고 디바이스·국가 차원이 추가되기 때문.
- **화면 스타일**: 시안은 레이아웃만 참조, 색·톤은 기존 앱(neutral) 기준.
  KPI 카드는 [StatCard](../../../src/components/overview/StatCard.tsx)에 옵션(분수
  보조문구, %p 비교, 강조)을 추가해 재사용.

### 4. 브랜드 관리 추가 항목

연결 관리(`/brands-management/[brandId]/connections`)에 GSC 카드와 같은 형태로:

- **YouTube 채널 카드 (필수)**: 채널 URL/@핸들 입력 → YouTube Data API로 채널
  ID(UC…)·채널명·썸네일 조회 후 저장. 복수 채널. API 키만 사용(OAuth 불필요).
- **AIO 추적 설정 (선택, 기본값 있음)**: 수집 국가·언어·디바이스(기본 KR·ko·모바일),
  최적화 기준일(대시보드 "비교 기준" 기본값).
- 인용 소스 분류는 기존 브랜드 설정 재사용: 자사 웹 = 기본 URL·브랜드 URL,
  경쟁사 = 기타 브랜드, 그 외 = 블로그·미디어.

키워드 추가·그룹 지정과 영상 최적화 작업 이력은 설정이 아닌 운영 데이터이므로
새 페이지 안에서 관리한다.

### 5. 새 페이지 진입 안내

AI 가시성 → **YouTube AIO 인용** (전체 현황 + 키워드 상세). 설정 상태 기반으로
판단(한 번 닫으면 사라지는 방식 아님):

| 상태 | 화면 |
|---|---|
| YouTube 채널 미연동 | "YouTube 채널 연동 필요" 카드 + [연동하러 가기] → 선택 브랜드의 연결 관리 YouTube 카드. 본문 숨김 |
| 키워드 0개 | "추적할 키워드를 추가하세요" + [키워드 추가] |
| 수집 전 | 본문 표시, 지표 "–" + "첫 수집 대기 중" |
| 선택 항목 누락(경쟁사 등) | 본문 정상 + 가벼운 배너 |
| Demo 브랜드 | 연동 체크 없이 시안 샘플 데이터 |

### 6. 단계

| Phase | 내용 |
|---|---|
| 0. 검증 | 한국 로그아웃 상태 AIO 노출 여부, YouTube 인용 링크 형태(`watch?v=`·`youtu.be`·`t=`), 수집 방식(자체 크롤링 vs SERP API) 결정 |
| 1. 브랜드 관리 | 선택 브랜드 헬퍼, YouTube 채널 카드, AIO 추적 설정, Salesforce 브랜드 등록 |
| 2. 수집·판정 | AIO 수집 모드(국가·언어·디바이스), YouTube 판정(영상 → 채널 ID 캐시), 소스 5분류, 스냅샷 보관 |
| 3. DB | AIO 키워드, 관측 결과, 영상 캐시, 최적화 작업 이력 (`brand_id` 기준) |
| 4. 화면 | 사이드바 메뉴, 진입 안내, 전체 현황(시안 2p), 키워드 상세(시안 3p), Demo 샘플 데이터, 도움말 |
| 5. 부가 | 변화 알림(Slack 웹훅), SF 근거 문장 하이라이트, 키워드 제안, 스냅샷 내보내기 |

### 7. 열린 결정

- **수집 방식**: 자체 크롤링은 무료지만 단일 IP 캡차 위험(기존 스케줄러가 키워드당
  3~8분 간격 → 120개×2디바이스면 하루 약 22시간). SERP API(DataForSEO·SerpApi 등)는
  건당 과금이지만 AIO references를 구조화해 반환 — 요금·한국 AIO 지원은 확인 필요.
  수집 모듈은 어댑터 구조로 만들어 교체 가능하게 한다.
- **스냅샷 저장소**: 로컬 디스크 / 오브젝트 스토리지 / HTML만 DB.
- **고객 제공 정보**: Salesforce YouTube 채널(복수 여부), 초기 키워드, 경쟁사 목록.

### 8. Phase 0 검증 결과 (2026-09-28)

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
  키가 있으면 공식 Data API 사용([src/lib/backend/youtube.ts](../../../src/lib/backend/youtube.ts)).
- **캡차**: 20~40초 간격으로 **10번째 요청에서 캡차**. 자체 크롤링은 기존 스케줄러처럼
  키워드당 3~8분 간격이 필요 → 하루 약 150~250회가 현실적 상한(키워드 × 디바이스).
  키워드 100개 이상 × 2디바이스를 안정적으로 돌리려면 SERP API 또는 IP 분산 필요.
- **미검증**: 모바일 SERP의 AIO 구조(캡차로 중단) — 캡차 해제 후 재검증.

**결론**: 수집기는 어댑터 구조로 만들고, 우선 기존 방식(실제 Chrome) 어댑터로 구현한다.
키워드 규모가 확정되면 SERP API 어댑터 추가 여부를 결정한다.

### 9. 구현 현황 (2026-09-28)

| 영역 | 파일 |
|---|---|
| 브랜드 관리 — YouTube 채널 카드, AIO 추적 설정 | [YoutubeChannelsCard](../../../src/components/brands-management/YoutubeChannelsCard.tsx), [AioSettingsCard](../../../src/components/brands-management/AioSettingsCard.tsx), [brandAioConfig.ts](../../../src/lib/backend/brandAioConfig.ts), API `brands/[brandId]/youtube-channels`·`aio-settings` |
| 선택 브랜드 헬퍼 (범위 A) | 선택 브랜드 헬퍼(구 기획 파일명; 현재 구현은 코드에서 확인) |
| 수집기 (AIO, 실제 Chrome) | [collect-google-aio.mjs](../../../scripts/collect-google-aio.mjs), 추출 [lib/aio-extract.mjs](../../../scripts/lib/aio-extract.mjs), Chrome 공용 [lib/incognito-chrome.mjs](../../../scripts/lib/incognito-chrome.mjs) |
| 수집 회차 (공용) | [aio/collector.ts](../../../src/lib/backend/aio/collector.ts) — 정기 수집과 수동 수집이 같은 코드 |
| 정기 수집 러너 | [collect-aio.ts](../../../scripts/collect-aio.ts) — `npm run collect:aio` (키워드 간 3~8분) |
| 수동 수집 ("지금 수집") | [aio/jobRunner.ts](../../../src/lib/backend/aio/jobRunner.ts), API `youtube-aio/collect`(POST 시작·GET 상태·DELETE 중단), [AioCollectButton](../../../src/components/youtube-aio/AioCollectButton.tsx) — 전체/키워드 단위, 키워드 간 1~2분, 동시 1건 |
| 판정 · 저장 · 지표 | [aio/judge.ts](../../../src/lib/backend/aio/judge.ts), [aio/store.ts](../../../src/lib/backend/aio/store.ts), [aio/metrics.ts](../../../src/lib/backend/aio/metrics.ts), [youtube.ts](../../../src/lib/backend/youtube.ts) |
| 화면 | `/youtube-aio`(전체 현황), `/youtube-aio/[keywordId]`(키워드 상세), 연동 안내 [YoutubeAioSetupGate](../../../src/components/youtube-aio/YoutubeAioSetupGate.tsx), Demo 샘플 [data/youtubeAio.ts](../../../src/lib/db/data/youtubeAio.ts), 도움말 `youtube-aio` |
| DB | `brand_youtube_channels`, `brand_aio_settings`, `aio_keywords`, `aio_observations`, `aio_citations`, `youtube_videos`, `aio_video_work_logs` ([schema.ts](../../../src/lib/backend/database/schema.ts)) — 브랜드 삭제 시 CASCADE |
| 테스트 | `npm run test:unit`(URL 파싱·판정·지표), `npm run test:db`에 [aio/store.test.ts](../../../src/lib/backend/aio/store.test.ts) 추가 |

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

<a id="section-02"></a>

## 02. 영상 단위 추적 후속 계획

> 상태: 이 섹션은 2026-09의 초기 설계 기록이다. 현재 영상 관리 화면과 프롬프트 등록 경로가 구현돼 있으므로 [`youtube-manage`](../../../src/app/[org]/[brand]/youtube-manage/page.tsx)와 [`youtube-manage/prompts`](../../../src/app/api/youtube-manage/prompts/route.ts)를 기준으로 남은 범위를 재판정한다. 선행 작업인 YouTube AIO 인용 트래커는
> [youtube-tracking-spec.md](youtube-tracking-spec.md#section-01), 조직/URL 구조는
> [access-and-organization-spec.md](../access/access-and-organization-spec.md#section-02). 다른 PC에서 이어서 작업할 때는 §6부터.

### 1. 요청

1. 동영상 URL 등록
2. 등록된 동영상 URL의 인용 여부 체크 — 트래킹 시작
3. YouTube 동영상 메타데이터 기반 키워드 추천
4. 키워드 기반으로 프롬프트 라이브러리 AI 생성
5. 스케줄링으로 해당 URL 지속 트래킹

### 2. 전체 흐름

```
① 영상 URL 등록 → ② 메타데이터 수집 → ③ 키워드 추천(AI) → 사용자 선택
                                           ↓
④ 선택 키워드로 프롬프트 생성(AI) → 프롬프트 라이브러리에 추적 등록
                                           ↓
⑤ 스케줄 수집(키워드 → Google AIO, 프롬프트 → AI 답변) → 영상별 인용 현황
```

- **키워드**("Slack 세일즈포스 연동")는 Google 검색 결과의 AI Overview 인용을 본다 — 기존 AIO 키워드
  (`aio_keywords`)와 수집(`collect:aio`).
- **프롬프트**("Slack이랑 Salesforce 연동하려면 어떻게 해?")는 AI Mode·네이버 AI 같은 대화형 답변의
  인용을 본다 — 기존 프롬프트 라이브러리(`prompts`/`prompt_tracking`)와 수집(`collect:scheduled`).

### 3. 단계별 기획

#### ① 영상 URL 등록 (규모: 작음)

- YouTube AIO 인용 메뉴에 "영상" 탭(또는 하위 메뉴). URL 여러 개를 줄바꿈으로 한 번에 등록.
- 등록 시 영상 조회([src/lib/backend/youtube.ts](../../../src/lib/backend/youtube.ts) `resolveYoutubeVideo`) →
  **브랜드에 연결된 채널(`brand_youtube_channels`)의 영상인지 확인**, 다른 채널이면 경고(등록은 허용할지 결정).
- 새 테이블 `brand_videos`(brand_id, video_id, url, title, channel_id, 추적 주기, 상태, 등록일). 브랜드 삭제 시 CASCADE.

#### ② 메타데이터 수집 (규모: 작음~중간)

- 제목, 설명, 태그, 챕터(설명란 타임스탬프 파싱), 길이, 게시일, 조회수, 썸네일 — API 키 없이 영상 페이지의
  `ytInitialPlayerResponse`/`videoDetails`에서 읽을 수 있음(키가 있으면 Data API `videos.list`).
- **자막(스크립트)**: 있으면 키워드 추천 품질이 크게 오름. 자동 자막은 플레이어 응답의 `captionTracks`
  URL로 받을 수 있으나 YouTube 구조 의존이라 불안정 — "가능하면" 쓰는 선택 항목. (공식 API의 자막 다운로드는
  채널 소유자 OAuth가 필요)
- 메타데이터는 `brand_videos`(또는 별도 `video_metadata`)에 JSON으로 보관, 재수집 버튼.

#### ③ 등록 영상 인용 추적 시작 (규모: 작음)

- `aio_citations`에 이미 `video_id`가 기록되고 있어 **등록 즉시 과거 수집분까지 인용 기록을 보여줄 수 있다**.
- 영상별 상세: 인용된 키워드, 순위, 인용 구간(`start_seconds`), 첫 인용일, 최근 14일/주간 추이,
  기존 "최적화 작업 이력"(`aio_video_work_logs`)과 같은 타임라인.
- 영상별 상태: 추적 키워드 N개 · 마지막 수집 · 다음 수집 예정.
- (결정 §4-2에 따라) AI Mode·네이버 AI 답변 인용(`citations` 테이블, URL 기준)도 영상 ID로 대조해 합산.

#### ④ 메타데이터 기반 키워드 추천 (규모: 중간, AI 필요)

- 입력: 영상 메타데이터(+자막 요약) + 브랜드 정보(업종, 경쟁사 `otherBrands`, 이미 추적 중인 키워드).
- 출력(JSON): 키워드 후보 10~20개 — 그룹(브랜드/카테고리/비교/How-to), 추천 이유, 관련 챕터·구간.
- 사용자가 선택 → `aio_keywords`에 추가(정규화 키워드로 중복 방지) + 영상과 연결하는 새 테이블
  `video_keywords`(video_id, keyword_id, source: ai|manual).

#### ⑤ 키워드 기반 프롬프트 생성 (규모: 중간, AI 필요)

- 키워드마다 실제 사용자가 AI에 물을 법한 질문형 프롬프트 2~3개(정보형·비교형·문제 해결형 등).
- 미리보기에서 선택 → 기존 프롬프트 라이브러리에 추적 등록(`trackTopic`, 카테고리 = 키워드 그룹, 토픽 = 키워드).
- 출처(`prompt_sources`)에 `source_type: "youtube-video"`, `source_key: <video_id>` — 영상 → 프롬프트 역추적.

#### ⑥ 스케줄 수집 (규모: 중간, 실행 환경 결정 필요)

- 영상별 추적 주기(매일/주 2회/매주). 스케줄러가 등록 영상의 키워드를 우선 수집.
- 키워드 → `collect:aio`, 프롬프트 → `collect:scheduled`(둘 다 이미 모든 조직을 돈다).
- ⚠️ 자체 Chrome 수집은 캡차 때문에 **하루 150~250회**가 현실적 상한(예: 영상 10 × 키워드 10 × 디바이스 2 = 200회).
  영상이 늘면 SERP API 어댑터가 필요([youtube-tracking-spec.md](youtube-tracking-spec.md#section-01) §7,
  DataForSEO 권장 — 한국어 AIO 지원 여부는 검증 필요).
- Vercel(서버리스)에서는 Chrome이 돌지 않는다 → Chrome이 있는 PC/서버의 cron, 또는 SERP API + Vercel Cron.

### 4. 결정 필요

1. **AI 생성 방식(가장 중요)**
   - A. Claude API 연동(권장): 버튼 한 번으로 생성. API 키(`ANTHROPIC_API_KEY`)와 사용량 비용 필요.
     구현 전 `claude-api` 스킬로 최신 모델·요금 확인.
   - B. 기존 LLM 브리지([LlmBridgeModal](../../../src/components/ui/LlmBridgeModal.tsx)): 비용 없음, 매번 복사·붙여넣기.
2. **인용 추적 범위**: Google AIO만 / AI Mode·네이버 AI 답변 인용까지 영상별로 합산.
3. **수집 실행 환경**: 로컬 PC 작업 스케줄러 / 별도 서버(VPS) cron / SERP API + Vercel Cron.
4. **영상 등록 방식**: URL 직접 등록만 / "채널 최신 영상 N개 자동 가져오기"도.

### 5. 제안 순서

1. **1차(AI 불필요)**: ① → ③ → ② — 영상 등록 + 영상별 인용 현황(과거 수집분 포함).
2. **2차**: ④ → ⑤ — 결정 §4-1에 따라.
3. **3차**: ⑥ — 결정 §4-3에 따라.

### 6. 다른 PC에서 이어서 작업하기

#### 코드 현황 (main 기준)

- YouTube AIO 인용 트래커: `/{조직}/{브랜드}/youtube-aio`, 수집 `npm run collect:aio`, 수동 "지금 수집" 버튼.
- 다중 조직 + URL 구조: `/{조직 슬러그}/{브랜드 슬러그}/{화면}`, 설정 > 조직 관리.
- 운영 DB에 Salesforce 조직(`/salesforce/salesforce`)과 AIO 수집 데이터(관측 15건) 이관 완료.
- 조직 단위 이관: `scripts/sync-org-to-remote.ts` (`--org <이름>`, 기본 미리보기, `--apply`로 반영).

#### 새 PC 준비

1. `npm install` (Node 22.13+). 수집을 돌릴 PC라면 **Google Chrome** 설치.
2. 프로젝트 루트에 `.env.local` 생성 — `POSTGRES_URL="…"` (로컬/개발 Postgres). git에 없다.
   - 로컬 Postgres가 없으면: 프로젝트 밖(또는 `.tmp/`) 폴더에서 `npm i embedded-postgres`로 임시 서버를 띄워도 된다.
     Windows 사용자 폴더 경로가 한글이면 `TMP`/`TEMP`를 영문 경로로 지정하고 `initdbFlags: ["--locale=C", "--encoding=UTF8"]`.
   - 새 DB에서 앱이 처음 뜰 때 테이블·시드·조직 슬러그가 자동 생성된다.
3. 운영 DB 작업(이관 등)이 필요하면 `.env.neon.local`에 `POSTGRES_URL="…"`(따옴표 필수 — 값의 `&` 때문). git에 없다.
4. 확인: `npm run test:unit`, `npm run test:db`(로컬 Postgres 필요), `npx next build`.

#### 남은 정리·주의

- 원래 PC에 옛 페이지 폴더가 빈 채로 남았을 수 있다(`src/app/brands-management` 등, 개발 서버 잠금 때문). git엔 없고
  동작 영향 없음 — 새 PC에서는 해당 없음.
- 기존 린트 에러(이번 작업 이전부터) 20여 건은 그대로다 — `npx eslint src`로 확인.
- 루트의 요구사항 PDF 2개는 고객 자료라 커밋하지 않았다 — 필요하면 따로 옮길 것.

### 7. 1차 상세 설계 — 영상 등록 + 영상별 인용 기록 (2026-09-29, 경량안)

§5의 1차를 **인용 기록(`aio_citations`)만으로 만들 수 있는 범위**로 줄였다. AI·수집기·기존 화면 계산은 건드리지 않는다.
처음 설계(지표·메타데이터 포함)를 검토해 보니 무게가 세 곳에 몰려 있었다. 셋 다 1차에서 뺐다(§7.6).
- 관측 전체(AIO 본문 포함)를 읽어야 나오는 지표: 상태, 인용 유지율, 14일 추이
- HTML 파싱에 기대는 메타데이터 수집
- 부가 기능: 미등록 영상 제안, 챕터 매핑

#### 7.1 원칙

- 화면의 모든 값은 `aio_citations ⋈ aio_observations`에서 **인용된 행만** 읽어서 만든다. "AIO 없음", "미인용", "미측정"을
  구분해야 하는 값은 넣지 않는다 — 그 구분은 키워드 상세가 이미 한다.
- 영상 조회는 기존 `resolveYoutubeVideo`(제목·채널·썸네일)에 채널 이름만 더해 쓴다. 새 파싱 코드는 없다.
- 수집이 없었던 기간은 0이 아니라 "–"로 보여 준다(§2 원칙). 선택한 디바이스로 최근 7일에 성공한 수집이 없으면 최근 7일 값은 "–".
- "우리 채널" 배지는 판정이 아니라 영상의 속성이다. 현재 연결된 채널 기준으로 표시한다. 인용 분류(`own_video`)는 기존처럼 수집 당시 기준이다.
- 결정: 타 채널 영상도 등록할 수 있다("타 채널" 배지). 추적 범위는 Google AIO만이고, 등록은 URL로만 받는다.

#### 7.2 DB

```sql
CREATE TABLE IF NOT EXISTS brand_videos (
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','archived')),
  added_at TEXT NOT NULL,
  PRIMARY KEY(brand_id,video_id)
);
```
- 제목·채널·썸네일은 기존 캐시 `youtube_videos`에 저장한다(`cacheVideo`). 채널 이름용 `channel_title` 컬럼 하나를 추가한다
  (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`). 판정이 캐시할 때 비어 있으면 기존 값을 지우지 않는다(`COALESCE`).
- 우리 채널인지는 읽을 때 `brand_youtube_channels`와 대조한다.
- 영상 삭제 = 보관. 다시 등록하면 `active`로 돌아온다.
- [sync-org-to-remote.ts](../../../scripts/sync-org-to-remote.ts): `brand_videos`를 복사하고, 등록 영상 ID도 `youtube_videos` 복사 대상에 넣는다.
  `youtube_videos`는 `channel_title`까지 복사하고 충돌 시 채널 이름만 갱신한다.

#### 7.3 백엔드

- `youtube.ts`
  - `parseVideoInput(raw)`: 영상 URL 또는 11자리 ID → `videoId`(기존 `parseYoutubeVideoUrl` 재사용).
  - `lookupYoutubeVideo(videoId)`: 결과를 `found | not_found | error`로 나눈다. 기존 `resolveYoutubeVideo`는 요청 실패(차단·할당량)와
    "영상 없음"을 둘 다 `null`로 돌려줘 구분이 안 된다. 채널 이름도 받는다(API `snippet.channelTitle`, HTML `videoDetails.author`).
- `aio/store.ts`: 집계는 전부 SQL에서 한다. 인용 행을 서버로 가져와 계산하지 않는다(행 수가 계속 늘어난다).
  - `listBrandVideos`, `addBrandVideo`(`added | reactivated | exists`), `archiveBrandVideo`
  - `videoCitationSummaries(brandId, videoIds, device, sinceDate)`: 영상별 한 행(`GROUP BY video_id` + `FILTER`).
  - `videoKeywordCitations(brandId, videoId, device)`: 영상 하나의 활성 키워드별 한 행.
  - `hasMeasurementSince(brandId, device, sinceDate)`: 최근 7일 값을 "–"로 보일지 판단.

| 값 | 정의 | 키워드 범위 |
|---|---|---|
| 인용 키워드 | 최근 7일 안에 이 영상을 인용한 키워드 수 | 활성 |
| 최고 순위 | 최근 7일 인용 중 가장 앞선 순위 | 활성 |
| 첫 인용일 · 마지막 인용일 | 등록 전 수집분까지 포함 | 보관 포함 — 키워드를 보관해도 기준점이 움직이지 않게 |
| (상세) 최근 순위 · 인용 구간 | 그 키워드의 **마지막 인용일** 값. 인용 구간은 서로 다른 타임스탬프 최대 3개 | 활성 |
| (상세) 인용된 날 수 | 이 키워드에서 인용된 날 수(전체 기간) | 활성 |

모든 값은 선택한 디바이스 기준이다.

#### 7.4 API

| 메서드 | 경로 | 내용 |
|---|---|---|
| POST | `/api/youtube-aio/videos` | `{brandId, urls}`: 한 번에 **최대 10개**, 동시 3개씩 조회한다. 줄마다 `added·reactivated·exists·invalid·not_found·error`와 `ownChannel`을 돌려준다. `error` 줄은 "잠시 후 다시 시도"로 안내하고 입력칸에 남긴다 |
| DELETE | `/api/youtube-aio/videos?brandId&videoId` | 보관 |

- 두 API 모두 `getManagedBrand(tenant.orgId, brandId)`로 브랜드 소속을 확인한다. 기존 `keywords`·`work-logs`의 DELETE에도 같은 확인을 넣는다.
- 운영에는 `YOUTUBE_API_KEY`를 권장한다. 키 없이 HTML로 조회하면 Vercel IP에서 차단될 수 있다.

#### 7.5 화면

- 기존 `/youtube-aio` 상단에 **키워드 | 영상** 탭([Tabs](../../../src/components/ui/Tabs.tsx), `router.push`). 탭을 바꿔도 디바이스 조건은 유지한다.
  - 제목·탭을 `YoutubeAioHeader`로 빼서 두 목록 화면(키워드·영상)만 쓴다. 상세 화면은 지금처럼 "← 돌아가기"만 둔다
    (`layout.tsx`로 하면 키워드 상세에도 탭이 붙는다).
- 채널 미연동 안내는 영상 탭에도 그대로 적용한다(채널 연결이 이 기능의 전제).
- **영상 목록** `/youtube-aio/videos`
  - 디바이스 필터, [영상 등록] 모달
  - 표: 썸네일·제목(채널, 타 채널 배지) · 인용 키워드 · 최고 순위 · 마지막 인용일 · 첫 인용일 · 등록일 · 보관
  - 인용 기록이 없으면 "–"를 표시한다
- **영상 상세** `/youtube-aio/videos/[videoId]`
  1. 헤더: 썸네일, 제목(YouTube 링크), 채널, [보관]
  2. 인용 키워드 표: 키워드(키워드 상세 링크) · 마지막 인용일 · 최근 순위 · 인용 구간(타임스탬프) · 인용된 날 수
  3. 최적화 작업 이력: 기존 work-logs API를 그대로 쓴다. 키워드 상세의 작업 이력 UI를 `VideoWorkLogTimeline`으로 떼어 두 화면이 같이 쓴다
- **Demo**: 샘플 등록 영상 4개(자사 3, 타 채널 1). 기존 관측 샘플을 그대로 계산에 쓴다.
- **도움말**: `youtube-aio` 항목에 영상 탭 설명을 추가한다.

#### 7.6 1차에서 뺀 것

도움말 및 학습 > 로드맵의 "YouTube 영상 단위 추적 고도화 시" 그룹([help.ts](../../../src/lib/db/data/help.ts) `youtube-video-tracking`)에 같은 항목이 있다. 구현하면 그 항목을 지운다.

| 뺀 기능 | 이유 | 다시 볼 시점 |
|---|---|---|
| 상태(인용 중/최근 없음), 인용 유지율, 영상×키워드 14일 추이 | 관측 전체(본문 포함)를 읽어야 한다. 부분 수집일에는 값이 틀린다 | 경량 관측 조회를 만들 때(키워드 현황 성능 개선과 함께) |
| 메타데이터(설명·태그·길이·조회수·챕터), 재수집 | 키 없는 HTML 파싱이 불안정하다. 쓰임새는 키워드 추천(2차 ④) | 2차. API 키 전제로 `videos.list` 사용 |
| 인용 구간 → 챕터 매핑 | 챕터 메타데이터가 필요하다 | 2차 메타데이터 이후 |
| 인용된 미등록 영상 제안 | 부가 기능. 보관 영상 제외 규칙까지 필요하다 | 사용 피드백을 본 뒤 |
| 삭제·비공개 영상 표시 | 재수집 기능이 필요하다 | 메타데이터와 함께 |

#### 7.7 작업 순서

1. 스키마 + store + `test:db`(등록/재활성/보관, 영상별·키워드별 집계, 보관 키워드 범위, 디바이스 구분, 측정 여부, CASCADE)
2. `parseVideoInput`, `lookupYoutubeVideo` + `test:unit`
3. API 2개와 기존 DELETE 확인 보강
4. 탭 → 영상 목록 → 영상 상세(작업 이력 컴포넌트 분리)
5. Demo · 도움말 · sync 스크립트
6. `npm run test:unit`, `npm run test:db`, `npx next build`, Salesforce 데이터로 확인

### 8. YouTube 관리 구현 (2026-09-30)

§7의 "영상 등록 + 영상별 인용 기록"을 채널 전체 영상 관리로 넓혀 새 메뉴 **YouTube 관리**(`/youtube-manage`)로 만들었다.
프롬프트 통합([prompt-surfaces-spec.md](../visibility/prompt-surfaces-spec.md))이 끝난 뒤라, 예상 프롬프트는 별도 저장소 없이 프롬프트 라이브러리에 등록한다.

- 영상 가져오기: YouTube Data API `playlistItems`(채널 업로드 재생목록, 50개씩)로 수동 실행 시 채널당 최신 500개까지 가져온다. 매일 09:00 KST에는 Vercel Cron(`/api/cron/youtube-videos`)이 연결된 모든 채널의 최신 1페이지를 확인한다. `YOUTUBE_API_KEY`와 `CRON_SECRET`이 필요하다. 한 채널이 여러 브랜드에 연결됐으면 API는 한 번 호출하고 각 브랜드에 반영한다. 목록은 채널 열과 채널별 필터를 제공한다.
- 체크: `brand_videos.checked`. 가져온 영상은 체크 해제로 들어오고, 직접 등록(`addBrandVideo`)한 영상은 체크 상태. 재가져오기는 제목·게시일·설명만 갱신한다.
- 예상 프롬프트: 제목+설명(500자)만 근거로 AI가 영상당 3~6개 제안(`videoPromptSuggestion.ts`, 자막은 쓰지 않음) → 사람이 고른 것만 등록.
  플랫폼은 프롬프트별로 고르고 기본값은 `suggestSurfaces`. 영상 ↔ 프롬프트 연결은 `prompt_sources(youtube-video, 영상 ID)`.
- 인용 확인: 영상 상세에서 (1) 이 영상용 프롬프트별 AIO 결과, (2) 이 영상을 인용한 모든 프롬프트(`videoKeywordCitations`)를 함께 보여 준다. 수집이 없던 기간은 "–".
- 남은 것: 다른 플랫폼(AI 모드·네이버)의 영상 인용 표시, 메타데이터 재수집(삭제·비공개 영상 표시), 자막 기반 생성.
