# DataForSEO 작업 큐 전환 및 수집 UI 구현 지침

> 상태: 구현 기준 확정
> 작성일: 2026-11-17
> 대상: 이후 이 작업을 이어가는 개발자와 코딩 에이전트
> 문서 역할: DataForSEO 작업 큐, 비용 안전 정책, 수집 로그, 프롬프트 라이브러리 혼합 수집 UX의 단일 구현 지침

## 1. 이 문서를 먼저 읽어야 하는 이유

현재 구현은 프롬프트 라이브러리의 브라우저가 DataForSEO task를 제출하고 15초마다 결과를 회수한다. 최대 20건이라는 값도 Provider의 공식 제한이 아니라 프론트와 API에 둔 내부 배치 크기다. 첫 20건이 완료되기를 기다리지 않고 접수 응답을 받으면 다음 20건을 제출하므로, 현재 구조는 **최대 20건만 active 상태로 유지하는 작업 큐가 아니다.**

목표 구조에서는 다음 책임을 분리한다.

```text
프롬프트 라이브러리: 수집 요청 생성과 비용 승인
서버 worker: 최초 제출, 결과 회수, 원본 저장, 제품 반영
수집 로그: 진행 확인, 결과 확인, 실패 진단, 사용자 재제출
사이드바: 진행 중·확인 필요 상태 알림
```

이 문서와 기존 코드가 충돌하면 신규 작업 큐와 UI는 이 문서를 기준으로 구현한다. Provider 표면·normalizer·기존 제품 투영 계약은 같은 폴더의 `README.md`를 함께 따른다.

## 2. 확정된 제품 원칙

1. 사용자가 비용을 확인하고 수집을 승인하기 전에는 유료 Provider POST를 보내지 않는다.
2. 승인된 수집 요청에 포함된 각 task는 최초 제출을 한 번만 허용한다.
3. Provider POST는 오류·timeout·서버 종료가 발생해도 자동 재제출하지 않는다.
4. 재제출은 사용자가 추가 예상 비용을 다시 확인하고 명시적으로 요청할 때만 새 task로 수행한다.
5. 이미 제출된 task의 상태 조회, 결과 회수, artifact 저장, 정규화, 제품 투영은 자동 복구할 수 있다.
6. 화면을 닫거나 서버 인스턴스가 교체되어도 제출된 작업의 결과 회수가 계속되어야 한다.
7. 완료된 일부 결과는 다른 느린 task를 기다리지 않고 즉시 저장하고 수집 로그에 노출한다.
8. 프롬프트 라이브러리는 수집 운영 화면이 아니다. 진행 확인과 재제출은 수집 로그에 집중한다.
9. 레거시 수집기는 사용자 PC·Chrome·캡차·결과 업로드에 의존하므로 기존 진행 모달과 이탈 경고를 유지한다.
10. `submission_unknown`은 자동 재제출하지 않고 사용자 또는 운영자 확인 대상으로 격리한다.

## 3. 목표 실행 흐름

사용자가 100건을 승인하고 최대 in-flight가 20이라면 다음처럼 동작한다.

```text
사용자 비용 확인 및 승인
        ↓
collection_request 1건 + provider_tasks 100건을 DB에 저장
        ↓
submit worker가 reserved task 중 최대 20건을 최초 제출
        ↓
19건 완료, 1건 Provider 처리 중
        ↓
완료된 19건은 즉시 저장하고 빈 19개 슬롯에 다음 task 최초 제출
        ↓
항상 설정된 최대 in-flight 이하로 유지
        ↓
모든 task가 완료·실패·확인 필요·취소 중 하나의 최종 상태에 도달
```

`20`은 초기 운영값일 뿐 고정 제품 계약이 아니다. 전역 한도와 조직별 한도를 환경설정 또는 운영 설정으로 분리한다.

## 4. 최초 제출과 재제출의 경계

### 4.1 최초 제출

사용자가 비용 확인 모달에서 승인한 요청에 속한 `reserved` task를 worker가 순서대로 제출하는 것은 승인 범위 안의 최초 제출이다. 사용자가 화면을 닫아도 worker가 남은 `reserved` task를 제출할 수 있다.

### 4.2 자동으로 가능한 복구

다음 작업은 새로운 유료 task를 만들지 않으므로 자동 수행할 수 있다.

- 제출된 Provider task의 상태 조회
- 완료 결과 GET
- 결과 원본 artifact 저장 재시도
- 저장 원본의 정규화 재시도
- `prompt_runs`, `aio_observations` 제품 투영 재시도
- 만료된 worker lease 회수

### 4.3 자동으로 금지하는 재제출

다음 상태에서 Provider POST를 다시 보내지 않는다.

- 오래된 `submitting`
- 네트워크 timeout 또는 응답 유실
- `submission_unknown`
- `provider_failed`
- worker 프로세스가 POST 전후에 종료되어 Provider 접수 여부를 증명할 수 없는 경우

외부 API에 대한 exactly-once를 증명할 수 없으면 중복 과금보다 미제출 가능성을 선택한다.

### 4.4 사용자 재제출

사용자가 실패 task를 선택해 재제출하면 다음 절차를 거친다.

1. 대상 task와 표면별 건수를 보여준다.
2. 추가 예상 비용을 다시 계산한다.
3. 사용자가 `비용 확인 후 재제출`을 누른다.
4. 기존 task를 초기화하지 않고 새로운 task를 만든다.
5. 새 task에 `retry_of_task_id`와 재제출 회차를 기록한다.

## 5. 작업 유실 최소화 원칙

작업 유실은 다음 다섯 구간으로 나누어 관리한다.

| 구간 | 필수 보호 장치 |
| --- | --- |
| 제출 전 | 사용자 승인과 task를 DB에 먼저 저장 |
| 제출 중 | `submitting` 기록, lease, 제출 시각과 worker 식별자 기록 |
| 제출 응답 | Provider task ID와 실제 비용을 즉시 DB에 저장 |
| 결과 대기 | 브라우저가 아닌 durable recovery worker가 회수 |
| 결과 처리 | 원본 저장 → 정규화 → 제품 투영 순서와 멱등 ID 유지 |

추가 규칙:

- task를 메모리 큐에만 두지 않는다.
- worker는 DB row를 lease로 선점하고 `FOR UPDATE SKIP LOCKED`로 중복 실행을 막는다.
- lease가 만료되면 다른 worker가 이어받을 수 있어야 한다.
- Provider POST가 개입된 불명확한 상태는 lease 만료만으로 다시 POST하지 않는다.
- 운영 artifact는 Blob/S3 등 영속 object storage에 저장한다. 로컬 디스크는 개발 adapter로만 사용한다.
- 상태별 최대 체류 시간을 정하고 stale task를 수집 로그와 운영 화면에 노출한다.
- 성공과 실패 모두 수집 이력에서 사라지지 않아야 한다.

## 6. 권장 데이터 모델

### 6.1 `collection_requests`

사용자가 한 번 승인한 수집 묶음이다.

- id, organization_id, brand_id, requested_by
- 요청 종류: manual, scheduled, retry
- 생성 시각, 승인 시각, 완료 시각
- 전체 task 수, 예상 비용, 실제 비용
- 대기·제출·처리·완료·실패·확인 필요·취소 개수
- 상태, 취소 요청 여부
- 원본 요청 ID 또는 재제출 요청 연결

### 6.2 `provider_tasks` 보강

- `collection_request_id`
- `retry_of_task_id`
- `submission_attempted_at`
- `lease_owner`, `lease_expires_at`
- 최초 제출 승인 식별자
- Provider task ID, 예상·실제 비용, 오류 단계

현재 dedupe key와 task 상태 머신은 유지하되 수집 요청과 worker 선점 정보를 추가한다.

### 6.3 혼합 수집 연결

하나의 사용자 요청 아래 SERP API와 레거시 수집 레인을 함께 연결한다.

```text
collection_request
├─ SERP API lane → provider_tasks
└─ Legacy lane   → collection_job
```

## 7. worker 책임 분리

### 7.1 Submit worker

- 승인된 `reserved` task만 대상으로 한다.
- 전역·조직별 in-flight 슬롯을 확인한다.
- lease를 획득한 task를 최초 한 번만 POST한다.
- Provider task ID를 저장한 뒤 `queued`로 전환한다.
- 완료·실패로 슬롯이 비면 다음 `reserved` task를 투입한다.
- 오류가 불명확하면 `submission_unknown`으로 전환하고 멈춘다.

### 7.2 Recovery worker

- `queued`, `collecting`, `artifact_failed`, `projection_failed`를 처리한다.
- Provider 결과 조회와 내부 재처리는 자동 수행할 수 있다.
- 완료된 개별 task는 요청 전체 완료를 기다리지 않고 즉시 저장한다.
- `completed`는 원본 저장과 제품 투영이 끝난 뒤에만 기록한다.

### 7.3 Stale-task sweeper

- lease 만료와 상태별 최대 체류 시간을 검사한다.
- 안전한 내부 재처리만 자동 수행한다.
- `submitting`, `submission_unknown`은 재POST하지 않고 확인 필요로 노출한다.

### 7.4 이벤트 기반 실행과 배포 설정

- 예약 API가 Provider task를 DB에 저장한 뒤 Vercel Queue에 wake 메시지를 발행한다.
- Queue consumer는 recovery를 먼저 실행해 빈 슬롯을 만든 뒤 신규 task를 제출한다.
- 처리할 task가 남은 경우에만 지연 메시지를 한 번 더 발행하며, 유휴 상태에서는 polling이나 cron 호출을 만들지 않는다.
- Queue 전달은 중복될 수 있으므로 DB lease와 task 상태 전이를 실행 멱등성의 기준으로 삼는다.
- 큐 메시지 중복 방지 키는 Provider task ID 묶음으로 만들며, 후속 wake는 조직·브랜드·실행 예정 분 단위로 합친다.
- `submission_unknown`은 running 대상에서 제외하고 자동 재제출하지 않는다.
- 기존 `/api/cron/dataforseo-queue`는 자동 스케줄 없이 수동 복구 진입점으로 유지한다.

운영 활성화에는 아래 환경변수가 모두 필요하다.

- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`
- Vercel에서는 Blob OIDC 설정 또는 `BLOB_READ_WRITE_TOKEN`
- 선택 설정: `DATAFORSEO_SUBMIT_BATCH_SIZE`, `DATAFORSEO_RECOVERY_BATCH_SIZE`, `DATAFORSEO_MAX_IN_FLIGHT`, `DATAFORSEO_QUEUE_DELAY_SECONDS`, `DATAFORSEO_SUBMISSION_STALE_SECONDS`

하나라도 빠지면 wake 메시지를 발행하지 않는다. 설정 불완전 상태에서 Queue가 반복 재시도해 Vercel 사용량을 만드는 것을 막기 위한 정책이다.

### 7.5 수집 실행 계층 독립 확장 기준

초기에는 같은 Vercel 프로젝트 안의 Schedule/Function으로 실행해도 되지만, 수집량이 늘면 웹 화면과 무관하게 실행 계층만 별도 서비스나 Queue consumer로 확장할 수 있어야 한다.

```text
Next.js BFF
├─ 사용자 승인 → collection_request/task 생성
└─ 수집 로그 → 저장된 상태 조회

Collection execution
├─ Submit worker
├─ Recovery worker
└─ Stale-task sweeper
        ↓
공유 PostgreSQL + 영속 object storage
```

분리 가능한 경계의 완료 조건:

- worker는 Next.js route, 사용자 세션, 브라우저 상태를 import하지 않는다.
- 실행 진입점은 task store, artifact store, Provider client, product projector interface에만 의존한다.
- DB 연결 시 앱 전체의 legacy 파일 동기화나 화면용 초기화를 실행하지 않는 worker 전용 store factory를 둔다.
- object storage 선택은 `process.env.VERCEL` 추론이 아니라 명시적인 adapter 설정으로 결정한다.
- 전역·조직별 in-flight는 프로세스 메모리가 아니라 DB lease로 제한해 worker 인스턴스를 늘려도 상한을 지킨다.
- 제출·회수 worker의 동시성, 실행 시간, 배치 크기를 웹 애플리케이션과 독립적으로 설정할 수 있다.
- 실행 계층을 별도 배포해도 기존 `collection_requests`, `provider_tasks`, 수집 로그 API 계약을 바꾸지 않는다.

현재 `DataForSeoOrchestrator`의 dependency injection 구조는 이 경계에 적합하다. 다만 `PostgresProviderTaskStore`의 앱 공용 DB 초기화 의존, Vercel 환경변수 기반 artifact adapter 선택, 별도 worker entrypoint와 lease 선점 부재는 분리 전에 제거해야 한다.

## 8. UI polling 원칙

UI polling은 작업을 진행시키면 안 된다.

```text
Worker: Provider 제출·회수·저장 수행
UI: DB에 저장된 상태만 읽음
```

권장 주기:

- 수집 로그 페이지: active 요청이 있을 때 5~10초
- 사이드바 상태 badge: 15~30초
- 브라우저 탭이 비활성화되면 polling 완화
- 포커스를 되찾으면 즉시 한 번 조회
- active 요청이 없으면 polling 중단

초기에는 polling으로 구현하고 SSE/WebSocket은 필요성이 확인된 뒤 검토한다.

## 9. 프롬프트 라이브러리 UX

### 9.1 SERP API만 선택한 경우

1. 대상과 수집 방식을 선택한다.
2. 예상 비용을 확인한다.
3. 사용자가 수집 시작을 승인한다.
4. 서버가 `collection_request`와 task를 생성한다.
5. 진행 모달을 띄우지 않고 접수 안내를 보여준다.

안내 예시:

```text
SERP API 수집 80건을 작업 큐에 등록했습니다.
화면을 닫아도 서버에서 계속 처리됩니다.

[수집 로그 보기] [계속 작업]
```

수집 로그로 강제 이동시키지 않는다.

### 9.2 레거시 수집기만 선택한 경우

현재 수집기 연결 확인, Chrome 상태, 키워드 진행률, 캡차 안내, 중단, 이탈 경고를 유지한다.

### 9.3 SERP API와 레거시 수집을 함께 선택한 경우

두 레인을 독립적으로 시작한다.

- SERP API는 작업 큐 등록 성공 여부만 모달에 안내한다.
- 모달의 진행률과 취소 UI는 레거시 수집기만 추적한다.
- SERP API Provider polling을 모달에서 수행하지 않는다.
- 레거시 진행 중 `수집 로그 보기`는 새 탭으로 연다. 현재 탭을 이동시켜 레거시 자동 반영을 중단시키지 않는다.
- 레거시 완료 후에는 같은 탭으로 수집 로그 이동을 안내할 수 있다.

혼합 모달 안내 예시:

```text
SERP API 80건을 서버 작업 큐에 등록했습니다.
SERP API 작업은 이 창을 닫아도 계속됩니다. [수집 로그 새 탭에서 보기]

레거시 수집기 12/20
현재: CRM 추천
```

닫기 경고 예시:

```text
레거시 수집이 진행 중입니다. 창을 닫으면 PC 수집기는 계속 실행될 수 있지만
결과 자동 반영이 중단될 수 있습니다. 이미 등록된 SERP API 작업에는 영향이 없습니다.
```

부분 실패 처리:

- SERP API 등록 성공·레거시 시작 실패: SERP API는 계속하고 레거시 오류만 표시한다.
- SERP API 등록 실패·레거시 시작 성공: 레거시는 계속하고 SERP API 등록 실패를 별도 표시한다. 자동 재제출하지 않는다.
- 둘 다 성공: SERP API 접수 안내와 레거시 진행 UI를 함께 표시한다.

## 10. 수집 로그 정보 구조

수집 로그를 수집 운영의 단일 관리 화면으로 만든다.

### 10.1 상단 `수집 현황`

진행 중이거나 확인이 필요한 `collection_request`를 요청 단위로 표시한다.

```text
구글AIO 외 2개 · SERP API
2026-11-17 14:30 · 요청자

완료 57 / 전체 100
대기 23 · 처리 중 18 · 실패 2
예상 $0.1200 · 실제 $0.0684

[상세 보기] [대기 작업 중단]
```

상태 문구는 사용자 관점으로 통일한다.

- 대기
- 제출 중
- Provider 처리 중
- 결과 저장 중
- 완료
- 일부 실패
- 확인 필요
- 취소됨

### 10.2 하단 `수집 결과`

현재 `prompt_runs` 기반 목록을 유지한다. 완료된 개별 결과는 요청 전체가 끝나기 전에 나타나야 한다.

SERP API 엔진 표기:

- `구글AIO · SERP API`
- `Google AI 모드 · SERP API`
- `네이버 AI 브리핑 · SERP API`

필터 확장:

- 수집 방식: 전체, SERP API, 설치형 수집기, LLM API
- 결과: 성공, AI 미노출, 실패
- 수집 요청 ID
- 최초 수집, 사용자 재제출

### 10.3 요청 상세 drawer 또는 상세 페이지

요청 요약과 개별 task를 함께 보여준다.

| 프롬프트 | 엔진 | 상태 | 실제 비용 | 처리 시간 | 조치 |
| --- | --- | --- | ---: | ---: | --- |
| CRM 추천 | 구글AIO | 완료 | $0.0012 | 42초 | 결과 보기 |
| ERP 비교 | 네이버AIO | 처리 중 | - | 3분 | - |
| 자동화 도구 | Google AI Mode | 실패 | $0.0012 | 31초 | 재제출 |
| B2B 솔루션 | 구글AIO | 확인 필요 | 미확정 | - | 상세 확인 |

## 11. 실패와 재제출 UI

실패 원인에 따라 조치를 분리한다.

### 자동 복구 상태

- artifact 저장 실패
- 제품 DB 투영 실패
- 일시적인 결과 조회 실패

표시는 `자동 복구 중`으로 하고 유료 재제출 버튼을 제공하지 않는다.

### 사용자 재제출 가능 상태

- Provider 최종 실패
- 제출 실패
- 파싱 실패 후 새 수집이 필요한 경우
- 사용자가 완료 결과를 다시 수집하려는 경우

재제출 모달은 추가 건수와 비용을 다시 보여준다.

### 확인 필요 상태

`submission_unknown`은 실패와 구분한다.

```text
Provider가 요청을 접수했는지 확인할 수 없습니다.
중복 과금을 막기 위해 자동 재제출하지 않았습니다.
```

운영 확인 정보와 Provider task 대사 수단을 먼저 제공하고, 사용자가 그래도 재제출할 때만 비용 확인 절차로 진입한다.

## 12. 사이드바 상태 표시

`수집 로그` 메뉴 옆에 가벼운 상태 indicator를 둔다.

- 진행 중: 파란 점 또는 spinner + active 요청 수
- 사용자 확인 필요: 주황색 `!` badge + 요청 수
- 진행과 확인 필요가 함께 있으면 확인 필요를 우선 강조
- 아무 상태도 없으면 badge를 숨김

숫자는 task 수가 아니라 수집 요청 수를 기본으로 한다. hover 또는 tooltip에서 처리 중 task 수를 보조로 보여준다.

예시:

```text
수집 로그   ● 2
수집 로그   ! 3
```

사이드바는 가벼운 summary endpoint만 polling하며 Provider API를 호출하지 않는다.

## 13. 취소 정책

- 아직 제출되지 않은 `reserved` task만 취소할 수 있다.
- 취소 요청 이후 submit worker는 새 task를 제출하지 않는다.
- 이미 제출된 task는 결과를 끝까지 회수하고 비용과 원본을 기록한다.
- 레거시 수집기 취소는 기존 collector 계약을 따른다.
- 혼합 요청에서는 SERP API 대기 task 취소와 레거시 수집 중단을 별도 조치로 제공한다.

## 14. 구현 순서

2026-11-17 추가 결정: 수집 로그는 요청당 한 행의 목록과 요청별 상세 페이지로 개편한다. 상세 안에 기존 개별 항목 테이블을 배치한다. 로컬 mock 검증 이후의 구체적인 후속 순서와 AEMaaCS 참고 지침은 [REMAINING-WORK.md](REMAINING-WORK.md)를 우선한다.

1. 실제 DB의 `provider_tasks` 스키마를 데이터 보존형 전진 마이그레이션으로 보정한다.
2. `collection_requests`와 task 연결을 추가한다.
3. lease와 in-flight 제한을 갖는 submit worker를 구현한다.
4. 화면 수명과 독립적인 recovery worker를 구현한다.
5. UI polling을 읽기 전용 상태 조회로 분리한다.
6. 수집 로그 상단에 요청별 진행 현황을 추가한다.
7. 사이드바에 진행 중·확인 필요 badge를 추가한다.
8. 프롬프트 라이브러리에서 SERP API 진행 polling을 제거한다.
9. 혼합 수집 모달을 레거시 진행 중심으로 변경한다.
10. 요청 상세와 사용자 비용 재확인 재제출 UI를 추가한다.
11. 조직별 예산, stale-task 경보, 운영 상태 화면을 추가한다.

## 15. 구현 완료 기준

- 화면을 닫아도 승인된 작업이 계속 처리된다.
- 설정된 최대 in-flight를 넘지 않는다.
- 하나의 task가 끝나면 빈 슬롯에 다음 `reserved` task가 제출된다.
- 느린 task와 무관하게 완료된 결과가 즉시 저장된다.
- 서버 재시작과 worker 교체 후 미완료 작업을 이어간다.
- 불명확한 Provider POST는 자동 재제출되지 않는다.
- 사용자가 추가 비용을 확인해야만 재제출할 수 있다.
- 대기·진행·완료·실패·확인 필요 상태를 수집 로그에서 확인할 수 있다.
- SERP API와 레거시 혼합 수집 시 모달은 레거시 진행을 유지하고 SERP API는 수집 로그로 안내한다.
- 사이드바에서 진행 중 또는 확인 필요 요청의 존재를 알 수 있다.
- 같은 task 결과의 중복 저장과 중복 과금이 없다.
- 성공과 실패 이력이 모두 요청 및 task 단위로 추적된다.

## 16. 구현 중 금지 사항

- UI polling API가 Provider 제출이나 결과 회수를 실행하게 만들지 않는다.
- `submission_unknown`, `provider_failed`, 오래된 `submitting`을 자동 POST하지 않는다.
- 재제출을 기존 task 상태 초기화로 구현하지 않는다.
- SERP API 진행 때문에 프롬프트 라이브러리 모달을 계속 열어두게 하지 않는다.
- 혼합 수집에서 수집 로그로 자동 이동시켜 레거시 수집 UI를 이탈시키지 않는다.
- 완료 결과를 요청 전체 완료까지 보류하지 않는다.
- 운영 artifact를 서버 로컬 디스크에만 의존하지 않는다.
- 스키마 불일치를 테이블 삭제나 데이터 초기화로 해결하지 않는다.

## 17. 구현 전에 추가로 확정할 운영값

- 전역 최대 in-flight
- 조직별 최대 in-flight
- 여러 수집 요청 사이의 우선순위 또는 round-robin 정책
- 상태별 stale 판정 시간
- 조직별 일·월 예산 한도
- `submission_unknown` 운영 대사 절차
- 완료 요청을 상단 현황에서 숨기는 시점

