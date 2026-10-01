# 구글AIO ↔ prompt_runs 통합 — 다음 작업 목록

> 2026-10-01 세션에서 1단계(구글AIO 수집 결과를 prompt_runs에도 적재)를 완료했다.
> 커밋: `a8bb1a4`(수집 로그 요약 행, 이후 제거), `5e15a7d`(실제 통합). 이 문서는 그 다음에 할 일을 순서대로 정리한다.

## 지금 상태 (완료)

- `src/lib/backend/aio/collector.ts`의 `saveCollectedResult()`가 구글AIO 수집 결과를 `aio_observations`(기존)뿐 아니라 `prompt_runs`에도 같이 적재한다 (`syncAioRunToPromptRuns`).
- `RawCitationMetadata`에 AIO 전용 선택 필드(`position`/`sourceType`/`videoId`/`channelId`/`startSeconds`) 추가 — 정보 손실 없이 보존.
- 수집 로그(`/collection-runs`)·가시성 개요·브랜드 가시성은 이제 구글AIO를 다른 4개 플랫폼과 완전히 동일하게 집계한다.
- YouTube AIO 전용 대시보드(`/youtube-aio`)는 아직 안 건드림 — 여전히 `aio_observations`/`aio_citations`를 직접 읽는다.

## 다음 작업 (우선순위 순)

### 1. 실제 수집 1회 돌려서 라이브 검증 (가장 먼저)
이번 세션 검증은 로컬 DB에 합성 데이터를 직접 넣어서 한 것 — 실제 `collect-google-aio.mjs`가 캡차 없이 끝까지 돌아 `saveCollectedResult`를 거쳐 `prompt_runs`에 정상 적재되는지 아직 실측 안 됨. "지금 수집" 버튼이나 `npm run collect:aio`로 키워드 1~2개만 실제로 돌려서:
- `prompt_runs`에 `platform='google-aio'` 행이 생기는지
- 수집 로그·가시성 개요에 정상적으로 집계되는지
확인한다.

### 2. 과거 aio_observations 데이터 백필
1단계는 "앞으로 수집되는 것"만 prompt_runs에 들어간다 — 과거에 이미 쌓인 aio_observations 기록은 수집 로그/가시성 개요에 소급 반영되지 않는다. 일회성 백필 스크립트(`scripts/backfill-aio-to-prompt-runs.ts` 같은 걸 `scripts/migrate-aio-keywords-to-prompts.ts` 패턴으로)를 만들어 기존 aio_observations 전체를 prompt_runs로 변환해 넣는다. `syncAioRunToPromptRuns`의 매핑 로직을 그대로 재사용.

### 3. YouTube AIO 대시보드를 prompt_runs 기반으로 전환 (2단계 핵심)
`/youtube-aio`, `/youtube-aio/[keywordId]` 페이지가 쓰는 `src/lib/backend/aio/store.ts`의 집계 함수들(`videoCitationSummaries`, `videoKeywordCitations`, `firstOwnCitationDates`, `channelCitationStats`)을 `aio_observations`/`aio_citations` 대신 `prompt_runs` + 그 `rawMetadata.citations`(1단계에서 추가한 `videoId`/`channelId`/`position`/`sourceType` 필드 포함)에서 읽도록 재작성한다.
- 순서: (a) 새 쿼리 함수를 만들어 기존 함수와 나란히 두고, (b) 2번 백필이 끝난 뒤 두 경로의 출력을 같은 브랜드로 비교해서 숫자가 일치하는지 검증, (c) 일치 확인되면 대시보드를 새 쿼리로 전환.
- `aio_keywords`/`brand_videos`는 계속 유지 (키워드·영상 아이덴티티 관리용, 관측 저장소가 아님).

### 4. 2~3이 끝나면 `aio_observations`/`aio_citations` 테이블 폐기 검토
대시보드가 전부 prompt_runs 기반으로 전환되고 운영에서 문제없음이 확인된 뒤에만 — 급하게 하지 않는다.

### 5. 수집기 쪽 정리
- `collect-aio.ts`/`collector.ts`의 중복 코드(캡차 처리, 디바이스 루프)가 `collect-google-ai.mjs`와 겹치는 부분이 있는지 재검토 — 당장 급한 건 아님.

## 참고 (이번 세션 범위 밖 — 별도 트랙)

`docs/geo-benchmark-research.md`의 🟡 반영하면 좋은 부분 중 아직 미착수: 엔진 확장, Prompt-style 프리셋, 추이 불연속 마커, "TBU" 배지, AND/count 기반 기술 체크 그룹핑, Topic-Research 거절 사유, Simulate 미리보기 등 — AIO 통합과 무관하게 독립적으로 진행 가능.
