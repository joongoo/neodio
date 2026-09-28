# YouTube 영상 단위 인용 추적 기획

> 상태: **기획 단계 — 착수 전 결정 필요(§4)**. 선행 작업인 YouTube AIO 인용 트래커는
> [youtube-aio-tracker-plan.md](./youtube-aio-tracker-plan.md), 조직/URL 구조는
> [multi-organization.md](./multi-organization.md). 다른 PC에서 이어서 작업할 때는 §6부터.

## 1. 요청

1. 동영상 URL 등록
2. 등록된 동영상 URL의 인용 여부 체크 — 트래킹 시작
3. YouTube 동영상 메타데이터 기반 키워드 추천
4. 키워드 기반으로 프롬프트 라이브러리 AI 생성
5. 스케줄링으로 해당 URL 지속 트래킹

## 2. 전체 흐름

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

## 3. 단계별 기획

### ① 영상 URL 등록 (규모: 작음)
- YouTube AIO 인용 메뉴에 "영상" 탭(또는 하위 메뉴). URL 여러 개를 줄바꿈으로 한 번에 등록.
- 등록 시 영상 조회([src/lib/backend/youtube.ts](../src/lib/backend/youtube.ts) `resolveYoutubeVideo`) →
  **브랜드에 연결된 채널(`brand_youtube_channels`)의 영상인지 확인**, 다른 채널이면 경고(등록은 허용할지 결정).
- 새 테이블 `brand_videos`(brand_id, video_id, url, title, channel_id, 추적 주기, 상태, 등록일). 브랜드 삭제 시 CASCADE.

### ② 메타데이터 수집 (규모: 작음~중간)
- 제목, 설명, 태그, 챕터(설명란 타임스탬프 파싱), 길이, 게시일, 조회수, 썸네일 — API 키 없이 영상 페이지의
  `ytInitialPlayerResponse`/`videoDetails`에서 읽을 수 있음(키가 있으면 Data API `videos.list`).
- **자막(스크립트)**: 있으면 키워드 추천 품질이 크게 오름. 자동 자막은 플레이어 응답의 `captionTracks`
  URL로 받을 수 있으나 YouTube 구조 의존이라 불안정 — "가능하면" 쓰는 선택 항목. (공식 API의 자막 다운로드는
  채널 소유자 OAuth가 필요)
- 메타데이터는 `brand_videos`(또는 별도 `video_metadata`)에 JSON으로 보관, 재수집 버튼.

### ③ 등록 영상 인용 추적 시작 (규모: 작음)
- `aio_citations`에 이미 `video_id`가 기록되고 있어 **등록 즉시 과거 수집분까지 인용 기록을 보여줄 수 있다**.
- 영상별 상세: 인용된 키워드, 순위, 인용 구간(`start_seconds`), 첫 인용일, 최근 14일/주간 추이,
  기존 "최적화 작업 이력"(`aio_video_work_logs`)과 같은 타임라인.
- 영상별 상태: 추적 키워드 N개 · 마지막 수집 · 다음 수집 예정.
- (결정 §4-2에 따라) AI Mode·네이버 AI 답변 인용(`citations` 테이블, URL 기준)도 영상 ID로 대조해 합산.

### ④ 메타데이터 기반 키워드 추천 (규모: 중간, AI 필요)
- 입력: 영상 메타데이터(+자막 요약) + 브랜드 정보(업종, 경쟁사 `otherBrands`, 이미 추적 중인 키워드).
- 출력(JSON): 키워드 후보 10~20개 — 그룹(브랜드/카테고리/비교/How-to), 추천 이유, 관련 챕터·구간.
- 사용자가 선택 → `aio_keywords`에 추가(정규화 키워드로 중복 방지) + 영상과 연결하는 새 테이블
  `video_keywords`(video_id, keyword_id, source: ai|manual).

### ⑤ 키워드 기반 프롬프트 생성 (규모: 중간, AI 필요)
- 키워드마다 실제 사용자가 AI에 물을 법한 질문형 프롬프트 2~3개(정보형·비교형·문제 해결형 등).
- 미리보기에서 선택 → 기존 프롬프트 라이브러리에 추적 등록(`trackTopic`, 카테고리 = 키워드 그룹, 토픽 = 키워드).
- 출처(`prompt_sources`)에 `source_type: "youtube-video"`, `source_key: <video_id>` — 영상 → 프롬프트 역추적.

### ⑥ 스케줄 수집 (규모: 중간, 실행 환경 결정 필요)
- 영상별 추적 주기(매일/주 2회/매주). 스케줄러가 등록 영상의 키워드를 우선 수집.
- 키워드 → `collect:aio`, 프롬프트 → `collect:scheduled`(둘 다 이미 모든 조직을 돈다).
- ⚠️ 자체 Chrome 수집은 캡차 때문에 **하루 150~250회**가 현실적 상한(예: 영상 10 × 키워드 10 × 디바이스 2 = 200회).
  영상이 늘면 SERP API 어댑터가 필요([youtube-aio-tracker-plan.md](./youtube-aio-tracker-plan.md) §7,
  DataForSEO 권장 — 한국어 AIO 지원 여부는 검증 필요).
- Vercel(서버리스)에서는 Chrome이 돌지 않는다 → Chrome이 있는 PC/서버의 cron, 또는 SERP API + Vercel Cron.

## 4. 결정 필요

1. **AI 생성 방식(가장 중요)**
   - A. Claude API 연동(권장): 버튼 한 번으로 생성. API 키(`ANTHROPIC_API_KEY`)와 사용량 비용 필요.
     구현 전 `claude-api` 스킬로 최신 모델·요금 확인.
   - B. 기존 LLM 브리지([LlmBridgeModal](../src/components/ui/LlmBridgeModal.tsx)): 비용 없음, 매번 복사·붙여넣기.
2. **인용 추적 범위**: Google AIO만 / AI Mode·네이버 AI 답변 인용까지 영상별로 합산.
3. **수집 실행 환경**: 로컬 PC 작업 스케줄러 / 별도 서버(VPS) cron / SERP API + Vercel Cron.
4. **영상 등록 방식**: URL 직접 등록만 / "채널 최신 영상 N개 자동 가져오기"도.

## 5. 제안 순서

1. **1차(AI 불필요)**: ① → ③ → ② — 영상 등록 + 영상별 인용 현황(과거 수집분 포함).
2. **2차**: ④ → ⑤ — 결정 §4-1에 따라.
3. **3차**: ⑥ — 결정 §4-3에 따라.

## 6. 다른 PC에서 이어서 작업하기

### 코드 현황 (main 기준)
- YouTube AIO 인용 트래커: `/{조직}/{브랜드}/youtube-aio`, 수집 `npm run collect:aio`, 수동 "지금 수집" 버튼.
- 다중 조직 + URL 구조: `/{조직 슬러그}/{브랜드 슬러그}/{화면}`, 설정 > 조직 관리.
- 운영 DB에 Salesforce 조직(`/salesforce/salesforce`)과 AIO 수집 데이터(관측 15건) 이관 완료.
- 조직 단위 이관: `scripts/sync-org-to-remote.ts` (`--org <이름>`, 기본 미리보기, `--apply`로 반영).

### 새 PC 준비
1. `npm install` (Node 22.13+). 수집을 돌릴 PC라면 **Google Chrome** 설치.
2. 프로젝트 루트에 `.env.local` 생성 — `POSTGRES_URL="…"` (로컬/개발 Postgres). git에 없다.
   - 로컬 Postgres가 없으면: 프로젝트 밖(또는 `.tmp/`) 폴더에서 `npm i embedded-postgres`로 임시 서버를 띄워도 된다.
     Windows 사용자 폴더 경로가 한글이면 `TMP`/`TEMP`를 영문 경로로 지정하고 `initdbFlags: ["--locale=C", "--encoding=UTF8"]`.
   - 새 DB에서 앱이 처음 뜰 때 테이블·시드·조직 슬러그가 자동 생성된다.
3. 운영 DB 작업(이관 등)이 필요하면 `.env.neon.local`에 `POSTGRES_URL="…"`(따옴표 필수 — 값의 `&` 때문). git에 없다.
4. 확인: `npm run test:unit`, `npm run test:db`(로컬 Postgres 필요), `npx next build`.

### 남은 정리·주의
- **운영 DB 비밀번호 재설정 권장** — 이관 작업 중 대화 로그에 노출됐다. 재설정 후 Vercel 환경변수와 `.env.neon.local` 갱신.
- 원래 PC에 옛 페이지 폴더가 빈 채로 남았을 수 있다(`src/app/brands-management` 등, 개발 서버 잠금 때문). git엔 없고
  동작 영향 없음 — 새 PC에서는 해당 없음.
- 기존 린트 에러(이번 작업 이전부터) 20여 건은 그대로다 — `npx eslint src`로 확인.
- 루트의 요구사항 PDF 2개는 고객 자료라 커밋하지 않았다 — 필요하면 따로 옮길 것.
