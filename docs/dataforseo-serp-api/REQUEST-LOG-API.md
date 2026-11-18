# 수집 요청 로그 조회 계약

> 2026-11-18 · 코드 조사 완료 / 구현 예정 계약
> `REMAINING-WORK.md`의 첫 소작업 결과. 이 문서는 현재 존재하는 API가 아니라 다음 구현의 기준이다.

## 확인한 연결 구조

| 대상 | 현재 연결 | 구현 시 처리 |
| --- | --- | --- |
| SERP 요청 | `collection_requests.client_request_id`로 동일 승인 배치를 합침 | 요청 목록의 기본 엔터티로 사용 |
| SERP 개별 항목 | `provider_tasks.collection_request_id` | 결과 유무와 관계없이 task당 한 행 |
| SERP 결과 | `prompt_runs.provider_task_id`, `aio_observations.provider_task_id` | 내부 task ID로 조인. 원격 Provider ID와 구분 |
| 레거시 작업 | `collection_jobs` 및 `prompt_runs.job_id` | 요청과 job 연결을 추가해야 함 |
| 기존 결과 상세 | `/api/collection-runs/detail?dir=...&filename=...` | 원문·인용 지연 조회 기능 재사용. 요청·브랜드 소속 검사 보완 |
| 기존 개별 목록 | 조직 전체 run을 읽고 메모리에서 페이지 처리 | 새 경로에서는 DB 필터·집계·페이지 처리를 수행 |

현재 페이지는 요청 요약 최근 5개와 개별 항목 목록을 함께 표시한다. 진행 중 task는 브랜드 범위로 조회하지만 결과 목록은 `listCollectedRuns(orgId)`로 조직 단위 조회한다. 새 요청 상세에서 이 동작을 그대로 재사용하면 다른 브랜드 결과가 섞일 수 있으므로 요청 소속을 먼저 제한한다.

요청의 저장된 `status`, `completed_at`, `actual_cost_usd`를 그대로 신뢰하지 않는다. 현재 요약 조회는 task 건수·실제 비용을 집계하고 화면의 `collectionRequestDisplayStatus`가 표시 상태를 계산한다. 새 API도 같은 우선순위를 서버에 적용해 필터·전체 건수·표시 상태를 일치시킨다.

## 공통 규칙

- 경로의 org/brand가 해석된 현재 tenant를 기준으로 범위를 제한한다. 임의 요청 ID 접근은 해당 조직·브랜드에 없으면 404, 인증·권한은 기존 `guardApi("read")`를 따른다.
- GET은 상태 조회만 수행한다. Provider 호출, 재제출, 결과 재처리, 분석 실행, 파일 동기화를 유발하지 않는다.
- 날짜는 UTC ISO 8601로 반환하고 화면은 KST로 표시한다. 기간은 `from` 이상, `to` 미만이다.
- `page`는 1부터, `size`는 10/25/50(기본 25), 기본 정렬은 `createdAt DESC, id DESC`다. 범위를 벗어난 page는 마지막 페이지로 보정하며 빈 결과는 page=1/pageCount=1이다.
- 잘못된 날짜·상태·엔진·정렬 값은 400이다. 사용자 입력은 SQL 파라미터로 전달하고 정렬은 허용 목록으로 매핑한다.
- 원문·인용 전체·artifact 내용은 목록 응답에 포함하지 않는다. 비용은 USD 숫자로 반환한다. actual 값은 조회 시점까지 기록된 비용이며 미완료 요청의 최종 비용을 뜻하지 않는다.

## 1. 요청 목록

`GET /api/collection-requests?page=1&size=25&q=...&status=running&surface=google-aio&from=...&to=...&sort=newest`

- `q`: 요청 ID, clientRequestId 및 소속 프롬프트 문구 검색. `surface`는 소속 task의 엔진 존재 여부로 필터한다.
- `status`: queued / running / completed / partially_failed / needs_attention / cancelled.
- `sort`: newest / oldest. 기간은 요청 생성 시각 기준이다.
- 검색·엔진 필터에 일치한 **요청 전체**의 건수와 비용을 반환한다. 해당 엔진 항목만 합산해 요청 합계를 축소하지 않는다.
- 응답: `{ rows, filteredTotal, page, pageSize, pageCount }`.
- 각 row: `id`, `clientRequestId`, `requestKind`, `requestedBy: { id, name } | null`, `createdAt`, `approvedAt`, `completedAt`, `status`, `surfaces`, `devices`, `counts`, `estimatedCostUsd`, `actualCostUsd`, `cancelRequested`, `retryOfRequestId`.
- `counts`: `{ total, waiting, running, completed, failed, attention, cancelled }`. 최초에는 요청이 소유한 task만 집계한다.
- 요청자 탈퇴/정보 누락 시 name은 null이며 조회를 실패시키지 않는다. 저장된 requested_by가 어떤 사용자 테이블 ID인지 확인 후 조인한다.
- 완료 시각은 모든 소속 항목이 종결됐을 때 개별 `completed_at`의 최댓값으로 계산한다. 시각 정보가 부족하면 null로 반환한다.

상태 집계는 `submission_unknown`이 있으면 needs_attention, 모든 항목 종결 시 실패가 있으면 partially_failed, 전부 취소면 cancelled, 나머지 종결은 completed다. 미종결 중 실행 중 항목이 있으면 running, 나머지는 queued다. 분모에는 기기별 task를 각각 센다. AI 미노출은 정상 완료다. parse_failed는 실패다.

## 2. 요청 요약·상세 항목

`GET /api/collection-requests/{requestId}` → `{ request }` (목록 row와 같은 요약 필드).

`GET /api/collection-requests/{requestId}/items?page=1&size=25&q=...&status=...&surface=...&sort=oldest` → `{ rows, filteredTotal, page, pageSize, pageCount }`.

- items의 `status`는 Provider task 상태 또는 `all`을 허용하며 기본값은 all이다. 전체 요청 요약은 항목 필터와 독립적이다.
- row: `id`(task ID), `executionKind`(serp-api/legacy), `promptId`, `query`, `surface`, `device`, `status`, `createdAt`, `submissionAttemptedAt`, `submittedAt`, `completedAt`, `estimatedCostUsd`, `actualCostUsd`, `errorCode`, `errorMessage`, `retryOfTaskId`, `result`.
- `result`: null 또는 `{ runId, dir, filename, outcome, answerLength, citationCount, category, topic }`. 기존 RunListRow의 화면 기능에 필요한 요약만 제공한다.
- task당 한 행을 유지한다. pending 행과 결과 행을 합쳐 두 행으로 만들지 않으며, 결과 조인은 중복되지 않게 처리한다.
- Google AIO가 prompt_runs와 aio_observations 양쪽에 저장돼도 같은 task를 중복 집계하지 않는다.
- 개별 원문 조회 전 요청 → task → run 소속을 확인한다. 클라이언트가 전달한 dir/filename만 신뢰하지 않는다.
- 단계 집계는 task 상태로부터 파생하며, 실제 발생 시각이 저장되지 않은 단계의 소요 시간을 만들어내지 않는다.

## 3. 레거시와 재사용 task의 이행 방침

첫 구현은 SERP 요청 목록·상세 API부터 만들되 기존 개별 로그 화면을 유지한다. 레거시 연결과 과거 이력 진입점을 준비하기 전 기본 페이지를 일괄 교체하지 않는다.

혼합 수집은 SERP에만 존재하는 requestId를 레거시 실행에도 전달하고 요청과 job 관계를 영속화해야 한다. 현재 요청 create는 task 1개 이상을 요구하므로 레거시 전용 승인까지 지원하려면 생성 규칙·건수 모델을 확장해야 한다. 이 변경은 별도 소작업으로 수행한다. 예정된 레거시 항목의 개수·상태도 결과 생성 전에 추적할 수 있어야 한다.

과거 이력은 기존 job 연결이 확인되면 그 작업 단위로 노출한다. job과 브랜드 관계가 증명되지 않는 결과는 임의 추정하지 않는다. 기존 권한 범위의 '이전 개별 수집 이력'에서 접근하도록 유지하고 브랜드 제한 보완을 별도 검토한다.

`appendApproved`는 새 task만 요청에 연결한다. 활성 task 재사용만 있으면 요청이 생성되지 않을 수 있다. 기존 task의 소유 요청을 변경하지 않으며 새 요청의 비용으로 다시 집계하지 않는다. 재사용 안내는 원래 요청 링크로 제공하고, 승인마다 재사용 항목까지 묶는 기능은 별도 요청-task 관계 모델을 도입할 때 확장한다.

## 다음 소작업

요청 목록용 DB 조회 서비스와 GET API를 구현한다. 범위 검사, 집계 상태 필터, 전체 건수, 페이지네이션부터 검증하고 기존 로그 화면은 유지한다. 그 뒤 요청 요약·항목 API, 레거시 연결, 목록·상세 UI 순서로 진행한다.
