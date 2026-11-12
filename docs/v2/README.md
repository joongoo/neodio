# DataForSEO 수집 전환 실행 계획

> 상태: 구현 전 기준 문서
> 작성일: 2026-11-12
> 문서 역할: DataForSEO 전환의 단일 기준 문서. 과거 계획·PoC 문서를 전제로 읽지 않는다.

## 현재 구현 상태 (2026-11-12)

- 완료: 기본 비활성화 네트워크 차단(`DATAFORSEO_ENABLED=true` 전에는 fetch 0회)
- 완료: Provider task·artifact 스키마, 중복 방지 키, 제출/회수 상태 머신
- 완료: Google AIO·Google AI Mode 구조화 결과 및 Naver HTML 정규화
- 완료: 기존 `prompt_runs`와 Google AIO `aio_observations` 투영, AI 미노출 outcome 분리
- 완료: 메모리 응답 기반 단위 테스트(실제 DataForSEO 호출 없음)
- 미완료: 수동·예약 수집 진입점 연결, recovery worker, 운영 비용/상태 화면
- 미완료: 실제 API 병행 검증과 표면별 전환 승인

현재 운영 factory는 준비되어 있으나 기능 플래그 기본값이 꺼져 있고, 제품의 수집 진입점에도 아직 연결하지 않았다. 따라서 이 단계의 코드는 DataForSEO로 네트워크 요청을 만들지 않는다.

## 다음 스텝

다음 작업은 **실제 DataForSEO API를 호출하지 않는 상태에서 제품 수집 흐름을 연결하는 것**이다. 사용자의 별도 승인 전까지 `DATAFORSEO_ENABLED` 기본값은 `false`로 유지하며, 실제 자격 증명을 사용한 호출·병행 검증·운영 전환은 진행하지 않는다.

1. 수동·선택·예약 수집 계획을 `provider_tasks` 예약 단계에 연결한다.
   - 기존 프롬프트와 표면 선택을 `google-aio`, `google-ai-mode`, `naver-aio` task로 변환한다.
   - 이 단계에서는 task를 DB에 `reserved`로만 기록하고 Provider POST는 실행하지 않는다.
   - 동일 조직·브랜드·프롬프트·표면·기기·시장·예약 구간의 중복 예약을 검증한다.
2. 기존 수집 작업 상태 API가 Provider 상태를 읽도록 어댑터를 추가한다.
   - `reserved`, `queued`, `collecting`, `completed`와 오류 상태를 기존 진행 화면 형식으로 매핑한다.
   - Collector 작업과 DataForSEO 작업을 전환 기간 동안 구분해서 표시한다.
3. recovery worker의 실행 경계만 구현한다.
   - 회수 대상 조회, 동시 실행 잠금, 재시도 간격, 최대 처리 건수를 구현한다.
   - 테스트에서는 가짜 응답만 사용하고 실제 GET 요청은 금지한다.
4. 비용 안전장치를 추가한다.
   - 조직별 일일 예상 비용과 실제 비용을 집계한다.
   - 예산 초과 시 신규 예약·제출을 차단하고 이미 제출된 task의 회수는 허용한다.
   - `submission_unknown`, `artifact_failed`, `projection_failed`를 운영 확인 대상으로 노출한다.
5. 로컬 PostgreSQL 하네스로 스키마와 멱등성을 검증한다.
   - 현재 환경에는 PostgreSQL 실행 파일이 없어 DB 하네스를 실행하지 못했다.
   - 신규 설치나 연결이 가능해지면 스키마 초기화, 중복 예약, 재회수, 제품 투영 재시도를 검증한다.
6. 별도 승인 후에만 실제 호출 검증을 시작한다.
   - 표면별 소량의 고정 질의로 1건씩 호출한다.
   - 원본 artifact, 비용, 정규화 결과를 확인한 뒤 병행 검증 단계로 이동한다.

다음 스텝의 완료 기준은 기능 플래그가 꺼진 상태에서 수동·예약 요청이 Provider task 예약과 상태 조회까지 이어지고, 테스트 중 DataForSEO 네트워크 호출이 0회임을 자동 검증하는 것이다.

## 1. 결론

Neodio의 다음 세 검색 표면은 DataForSEO 기반 서버 수집으로 전환한다.

| 제품 표면 | DataForSEO 결과 | 전환 판정 |
| --- | --- | --- |
| Google AI Overview | Google Organic Advanced의 `ai_overview` 구조화 결과 | 전환 대상 |
| Google AI Mode | Google AI Mode Advanced의 `ai_overview` 구조화 결과 | 전환 대상 |
| Naver AI 브리핑 | Naver Organic HTML 안의 AI 브리핑 본문·출처 | 조건부 전환 대상 |

Google 두 표면은 구조화 응답을 사용한다. Naver Advanced 결과에는 AI 브리핑 전용 타입이 없으므로 같은 Naver task의 HTML을 저장하고 Neodio가 파싱한다.

2026-11-12 실호출에서 `생성형 AI란` 질의의 Naver HTML에 다음 신호가 모두 포함된 것을 확인했다.

- `AI 브리핑`
- `aibType: "answertype"`
- 답변 출처 인덱스
- AI 요약 결과임을 알리는 Naver 고지문

따라서 세 표면 모두 기술적 수집 경로는 확인됐다. 다만 운영 전환과 로컬 Collector 제거는 아래 검증 게이트를 통과한 뒤 진행한다.

## 2. 목표와 완료 조건

### 목표

- 사용자 PC, Chrome, Playwright, 캡차 상태에 의존하지 않고 서버에서 세 표면을 수집한다.
- 기존 프롬프트·플랫폼 선택·가시성 분석·수집 로그 화면을 유지한다.
- AI 답변 본문, 출처, 노출 여부, 요청 조건, 비용과 Provider 원본을 재현 가능하게 연결한다.
- 예약·수동 수집 모두 같은 실행 경로를 사용한다.
- 네트워크 타임아웃과 재시도 상황에서도 중복 과금을 방지한다.

### 최종 완료 조건

다음 조건을 모두 만족하면 세 표면에 대한 DataForSEO 전환을 완료한 것으로 본다.

1. Google AIO, Google AI Mode, Naver AIO의 수동·예약 수집이 서버에서 동작한다.
2. 성공, AI 미노출, Provider 실패, 파싱 실패가 서로 다른 상태로 저장된다.
3. 본문·출처·브랜드 언급 분석이 기존 화면에 표시된다.
4. 동일 관측 키의 중복 task 생성이 차단된다.
5. 실제 task 비용과 월별 누적 비용을 조회할 수 있다.
6. 표본 병행 검증에서 아래 표면별 기준을 통과한다.
7. 롤백 스위치와 원본 재처리 경로가 검증된다.

## 3. 이번 전환의 범위

### 포함

- `google-aio`
- `google-ai-mode`
- `naver-aio`
- DataForSEO 인증정보·연결 상태
- task 생성, 결과 회수, 복구, 비용 기록
- Provider 원본 저장
- 표면별 정규화와 기존 분석 파이프라인 연결
- 수동 수집, 선택 수집, 예약 수집
- 관측 결과·오류·비용 운영 화면
- 기존 Chrome 수집과의 병행 비교 및 단계적 종료

### 제외

- `naver-ai`: Naver의 별도 AI 검색 탭. 이번에 검증한 통합검색 AI 브리핑과 다른 표면이다.
- `gemini`: 기존 공식 API 경로를 유지한다.
- GSC, Naver DataLab, 사이트맵 크롤, URL 검사 등 검색 실측·사이트 진단 기능
- DataForSEO Labs, Backlinks, Trends, Content Analysis 등 제품 확장
- 가시성 점수 공식과 화면 정보구조 개편

`naver-ai`는 당장 제거하지 않는다. UI에서는 “네이버 AI 검색”과 “네이버 AI 브리핑”을 계속 구분하고, 이번 전환의 적용 표면을 명시한다.

## 4. 확정 아키텍처

```text
수동 실행 / 예약 실행
        ↓
Collection Orchestrator
        ↓ 관측 단위 생성 및 중복 잠금
Provider Task Store ──→ DataForSEO Task POST
        ↓ task id              ↓
Recovery Worker ←── Task GET / Tasks Ready
        ↓
Raw Artifact Store
        ↓
Surface Normalizer
  ├─ Google AIO
  ├─ Google AI Mode
  └─ Naver AIO HTML
        ↓
Normalized Observation
        ↓
기존 prompt_runs / aio_observations / 분석 / 화면
```

### 4.1 실행 위치

- DataForSEO 호출은 서버에서만 수행한다.
- 인증정보는 서버 환경변수로만 관리하고 브라우저와 설치형 Collector에 전달하지 않는다.
- UI는 작업 생성과 상태 조회만 수행한다.
- 긴 대기 요청을 유지하지 않는다. task 제출과 결과 회수는 분리한다.

### 4.2 결과 회수 방식

첫 구현은 callback보다 주기적 복구 worker를 기준으로 한다.

1. task를 DB에 먼저 예약한다.
2. DataForSEO에 task를 제출하고 Provider task ID를 저장한다.
3. worker가 준비된 task를 조회한다.
4. 동일 task ID로 Advanced 또는 HTML 결과를 가져온다.
5. 원본 저장이 끝난 뒤 정규화한다.

callback은 이후 처리 지연을 줄이는 보조 신호로 추가할 수 있지만, callback 유실 여부와 관계없이 recovery worker가 최종 완료를 보장해야 한다.

### 4.3 원본 저장

- task 요청, POST 응답, 최종 GET 응답은 변경 없이 보존한다.
- Naver HTML도 원본 그대로 보존한다.
- DB에는 검색과 상태 전이에 필요한 메타데이터, checksum, artifact 위치만 둔다.
- 큰 JSON과 HTML은 압축 가능한 object storage에 저장한다.
- 개발 환경은 `.tmp` 기반 adapter를 사용할 수 있지만 운영은 로컬 파일에 의존하지 않는다.
- 원본 artifact는 조직별 prefix와 접근 권한을 적용하며 고객에게 직접 다운로드 링크를 노출하지 않는다.

## 5. 관측 단위와 중복 과금 방지

하나의 관측은 다음 키로 식별한다.

```text
organization + brand + prompt + surface + device + market + scheduled_window
```

- 같은 키는 한 번만 task를 생성한다.
- 내부 관측 ID를 DataForSEO `tag`에 넣는다.
- POST 전에 `reserved` 상태를 DB에 커밋한다.
- Provider task ID를 받은 뒤 `queued`로 바꾼다.
- POST 응답이 불명확하면 `submission_unknown`으로 두고 즉시 재제출하지 않는다.
- `tag`, Tasks Ready, 기존 task ID로 대사한 뒤에만 재시도 여부를 결정한다.
- 결과 GET과 정규화 재실행은 새로운 과금 task를 만들지 않는다.

권장 상태 모델은 다음과 같다.

```text
reserved
  → submitting
  → queued
  → collecting
  → raw_saved
  → normalized
  → completed

예외: submission_unknown | provider_failed | artifact_failed | parse_failed | cancelled
```

Provider task 상태와 제품 관측 결과를 분리한다.

| 제품 관측 결과 | 의미 |
| --- | --- |
| `ai_answered` | AI 답변이 있고 본문을 정상 추출함 |
| `ai_absent` | SERP 수집은 성공했으나 AI 답변이 없음 |
| `collection_error` | Provider·네트워크·원본 저장 실패로 노출 여부를 판단할 수 없음 |
| `parse_error` | 원본은 받았으나 현재 parser로 답변 여부를 확정할 수 없음 |

`ai_absent`를 `failed`로 저장하지 않는다. 가시성 지표의 유효한 분모이고, `collection_error`와 `parse_error`는 분모에서 제외한다.

## 6. 표면별 정규화 계약

모든 normalizer는 공통 결과를 만든다.

```ts
type NormalizedAiObservation = {
  observationId: string;
  providerTaskId: string;
  surface: "google-aio" | "google-ai-mode" | "naver-aio";
  query: string;
  device: "desktop" | "mobile";
  collectedAt: string;
  outcome: "ai_answered" | "ai_absent" | "collection_error" | "parse_error";
  answerText: string | null;
  citations: Array<{
    order: number;
    title: string;
    url: string;
    domain: string;
    providerPath: string;
  }>;
  provider: {
    name: "dataforseo";
    costUsd: number;
    schemaVersion: string | null;
    rawArtifactId: string;
  };
  normalizerVersion: string;
};
```

### Google AIO

- endpoint: Google Organic Advanced
- 옵션: `load_async_ai_overview=true`
- `type=ai_overview`만 AI 답변으로 판단한다.
- 일반 organic 결과를 AI 출처로 섞지 않는다.
- 본문은 `markdown` 우선, 없으면 하위 text block을 순서대로 결합한다.
- reference, link, Markdown URL을 모두 수집하되 정규 URL별로 중복 제거한다.
- 기존 `aio_observations`에는 AIO 상태·본문·문단·인용을 투영한다.
- 기존 가시성 분석을 위해 연결된 프롬프트에는 `prompt_runs`도 생성한다.

Google AIO의 YouTube 전용 정보는 별도 검증 대상이다. 영상 ID, 채널, 시작 시각, 문단별 인용 연결이 기존 Collector와 동등하지 않으면 기본 AIO 가시성은 DataForSEO로 전환하되 YouTube 상세 기능의 Collector 제거는 보류한다.

### Google AI Mode

- endpoint: Google AI Mode Advanced
- `type=ai_overview`의 본문과 reference를 사용한다.
- 결과는 `prompt_runs`에 투영한다.
- 응답의 `se_type=ai_mode`가 아니면 표면 불일치 오류로 격리한다.

### Naver AIO

- endpoint: Naver Organic task 1건
- 같은 task ID의 HTML 결과를 사용한다.
- `AI 브리핑` 제목만으로 노출을 확정하지 않는다.
- 답변 컨테이너, `aibType`, 답변 본문, 출처 구조, 고지문을 함께 판정한다.
- 결과는 `prompt_runs`에 투영하고 source는 기존 호환값 `naver-overview`를 유지한다.
- HTML은 parser 버전과 함께 보존한다.
- selector 변경 시 Provider를 재호출하지 않고 저장된 HTML을 새 parser로 재처리한다.
- 브리핑이 없는 정상 SERP는 `ai_absent`, AI 흔적은 있으나 본문을 못 읽으면 `parse_error`다.

## 7. 데이터 모델 변경

기존 `collection_jobs`, `prompt_runs`, `aio_observations`는 유지한다. 다음 Provider 실행 계층을 추가한다.

### `provider_tasks`

- 내부 task ID
- organization, brand, prompt, surface, device, market
- scheduled window와 중복 방지 key
- Provider와 endpoint
- Provider task ID와 tag
- 실행 상태, attempt, 오류 코드·메시지
- 예상 비용, 실제 비용
- 생성·제출·완료 시각
- normalizer version

### `provider_artifacts`

- provider task ID
- 종류: request, post response, advanced result, html
- object key, content type, encoding, byte size, checksum
- 저장 시각과 보존 만료 시각

### 기존 테이블 보강

- `prompt_runs`에 provider task 연결과 명시적 observation outcome을 추가한다.
- `aio_observations`에 provider task 연결을 추가한다.
- 기존 `original_json`은 정규화 결과와 원본 artifact 참조를 담고, 대용량 HTML 자체는 넣지 않는다.
- 기존 화면 호환을 위해 `PromptRunSeed` 형태는 유지하되 `rawMetadata.providerData`에 provider, task ID, artifact ID, normalizer version, cost를 기록한다.

## 8. 구현 단계

### Phase 0 — 기준선 고정

- 이 문서를 전환 단일 기준으로 지정한다.
- 기존 DataForSEO PoC 페이지와 `scripts/dataforseo-poc`의 재사용 범위를 결정한다.
- 세 표면별 대표 질의 세트를 만든다.
  - AI 답변 노출 예상
  - AI 답변 미노출 예상
  - 브랜드·경쟁사 포함
  - 출처가 많은 질의
  - desktop·mobile
- 현재 Collector 결과를 같은 조건으로 저장해 비교 기준을 만든다.

완료 기준: 테스트 질의, 기기, 기대 상태와 비교 방법이 코드 fixture 또는 버전 관리 문서로 고정되어 있다.

### Phase 1 — Provider 기반 계층

- DataForSEO client를 PoC 코드에서 운영 모듈로 분리한다.
- 인증, timeout, 오류 매핑, 응답 크기 제한을 구현한다.
- `provider_tasks`, `provider_artifacts` migration을 추가한다.
- 사전 예약과 중복 key를 구현한다.
- task POST, Tasks Ready/GET, recovery worker를 구현한다.
- 비용과 상태 전이 로그를 저장한다.
- 단위 테스트는 fake fetch로 성공·대기·실패·timeout을 재현한다.

완료 기준: 외부 API 없이 상태 전이와 중복 방지 테스트가 통과하고, sandbox 또는 최소 실호출로 한 task의 제출·회수·원본 저장이 끝까지 연결된다.

### Phase 2 — 세 표면 normalizer

- 공통 observation 계약을 구현한다.
- Google AIO normalizer와 fixture 테스트를 구현한다.
- Google AI Mode normalizer와 fixture 테스트를 구현한다.
- Naver HTML parser를 운영 모듈로 옮기고 fixture 테스트를 구현한다.
- URL 정규화, 출처 순서, 중복 출처 보존 규칙을 구현한다.
- parser/normalizer version과 원본 재처리 명령을 구현한다.

완료 기준: 저장된 원본 fixture를 네트워크 없이 반복 처리했을 때 결과가 결정적이고, 답변 있음·없음·파싱 실패가 구분된다.

### Phase 3 — 기존 저장·분석 연결

- Google AI Mode와 Naver AIO 결과를 `prompt_runs`로 투영한다.
- Google AIO를 `aio_observations`와 `prompt_runs`에 연결한다.
- 기존 언급·출처 분석에 정규화 결과를 입력한다.
- `ai_absent`를 유효 관측으로, 수집·파싱 오류를 제외 대상으로 반영한다.
- 수집 로그 상세에 Provider task, 비용, 요청 조건, 오류 단계를 표시한다.

완료 기준: 기존 가시성 화면이 세 표면의 DataForSEO 결과를 별도 목업 없이 읽고, 같은 원본 재처리로 중복 분석 행이 생기지 않는다.

### Phase 4 — 수동·예약 실행 전환

- 프롬프트 라이브러리의 세 표면 실행을 서버 orchestrator로 연결한다.
- 선택 수집과 전체 수집이 같은 API를 사용하게 한다.
- 예약 수집이 활성 tracking과 surface 설정을 읽어 관측을 생성하게 한다.
- 진행 화면을 Provider 상태 기준으로 바꾼다.
- 취소는 아직 제출하지 않은 관측만 취소하고, 이미 제출된 task는 결과를 회수하되 제품 반영 여부를 별도로 기록한다.
- 조직별 동시 실행량과 월 예산 상한을 적용한다.

완료 기준: Collector가 설치되지 않은 환경에서 세 표면의 수동·예약 수집과 결과 확인이 가능하다.

### Phase 5 — 병행 검증과 점진 전환

- 내부 조직부터 DataForSEO feature flag를 켠다.
- 동일 질의·기기·시간대에서 DataForSEO와 기존 Collector를 병행한다.
- 결과 차이를 `provider`, `surface`, `device`, `query`별로 기록한다.
- Google 두 표면과 Naver를 각각 독립적으로 승인한다.
- 승인된 표면부터 DataForSEO를 기본값으로 바꾼다.
- 즉시 롤백 가능한 기간 동안 기존 Collector 경로를 유지한다.

완료 기준: 아래 검증 게이트를 통과하고 한 주 이상의 예약 실행에서 중복 과금·고아 task·원본 유실이 없다.

### Phase 6 — 레거시 정리

- 승인된 세 표면의 Chrome 실행 코드를 제거한다.
- Collector에서 사이트맵 크롤 등 남겨야 할 기능을 분리한다.
- DataForSEO PoC 전용 페이지, 실행 잠금, 임시 문구를 제거한다.
- 도움말에서 “사용자 PC 수집기 필요” 설명을 표면별로 수정한다.
- 더 이상 쓰지 않는 npm script와 import endpoint allowlist를 정리한다.
- 운영 runbook, 비용 경보, 장애 복구 절차를 확정한다.

완료 기준: 제품에서 승인된 표면은 DataForSEO 경로만 사용하고, 남은 Collector 기능의 책임이 명확하다.

## 9. 검증 게이트

표본 수는 각 표면·기기별 최소 30개 질의로 시작하고, 답변 있음과 없음이 모두 포함되어야 한다.

| 항목 | 통과 기준 |
| --- | ---: |
| Provider task 최종 회수율 | 99% 이상 |
| 원본 artifact 저장률 | 100% |
| 중복 과금 task | 0건 |
| AI 노출 여부 정확도 | 95% 이상 |
| 답변 본문 추출 성공률 | 실제 AI 답변 기준 95% 이상 |
| 출처 URL precision | 95% 이상 |
| 출처 URL recall | 90% 이상 |
| 요청 조건 보존 | 100% |
| 실제 비용 저장 | 100% |
| 저장 원본 재처리 결정성 | 100% |

Naver는 다음 조건을 추가로 만족해야 한다.

- 최소 2주 동안 HTML parser의 `parse_error` 비율이 5% 미만이다.
- desktop과 mobile을 별도로 검증한다.
- 브리핑 제목만 있고 답변 데이터가 없는 경우를 오탐하지 않는다.
- selector 변경 경보와 저장 HTML 재처리가 실제로 동작한다.

Google AIO의 기존 YouTube 상세 기능까지 Collector를 제거하려면 다음을 별도로 검증한다.

- YouTube URL·영상 ID 추출
- 출처 순서
- 문단과 영상 출처 연결
- 시작 시각 제공 여부
- 자사 채널 판정에 필요한 채널 정보

이 중 제품에 필요한 필드가 DataForSEO 결과에 없다면 YouTube 상세 수집은 별도 경로를 유지하거나 기능 계약을 조정한 뒤 전환한다.

## 10. 비용·운영 안전장치

- task 제출 전 조직별 예상 비용을 계산한다.
- 월 예산 80%에서 경고, 100%에서 신규 유료 task를 중단한다.
- 비용은 POST 응답의 task `cost`를 단일 과금 기준으로 저장한다.
- GET 결과의 같은 cost를 추가 과금으로 합산하지 않는다.
- endpoint, priority, device, 유료 옵션을 비용 행과 함께 저장한다.
- 동일 조직·표면의 동시 제출량을 제한한다.
- 장애 시 무제한 자동 재제출하지 않는다.
- `submission_unknown`은 운영자 대사 대상 목록에 노출한다.
- Provider 장애가 전체 앱 장애가 되지 않도록 수집 큐만 일시 중단할 수 있어야 한다.

## 11. 롤아웃과 롤백

feature flag는 표면별로 둔다.

```text
DATAFORSEO_GOOGLE_AIO_ENABLED
DATAFORSEO_GOOGLE_AI_MODE_ENABLED
DATAFORSEO_NAVER_AIO_ENABLED
```

각 flag는 조직별 설정으로 override할 수 있게 한다.

롤백은 새 task 제출 경로만 기존 Collector로 되돌린다. 이미 제출된 DataForSEO task는 회수해 원본과 비용을 기록하되, 필요하면 제품 분석 반영을 중단한다. Provider 원본과 정규화 결과를 삭제하거나 기존 Collector 결과로 덮어쓰지 않는다.

## 12. 구현 순서 요약

1. Provider task·artifact 스키마와 상태 머신
2. 중복 방지 제출과 recovery worker
3. Google AIO normalizer
4. Google AI Mode normalizer
5. Naver HTML parser와 변경 감지
6. `prompt_runs`·`aio_observations` 투영
7. 수동 수집 연결
8. 예약 수집·예산 제한
9. 병행 비교와 표면별 승인
10. 레거시 Collector·PoC 정리

## 13. 구현 중 바꾸지 않을 원칙

- Naver AI 브리핑과 Naver AI 검색을 같은 표면으로 취급하지 않는다.
- Provider의 AI Summary 같은 별도 생성 요약을 실제 검색엔진 노출로 간주하지 않는다.
- AI 미노출을 수집 실패로 기록하지 않는다.
- 원본을 저장하기 전에 정규화 성공으로 처리하지 않는다.
- 불명확한 POST를 즉시 재제출하지 않는다.
- DataForSEO 응답 타입을 UI와 제품 분석 코드에 직접 퍼뜨리지 않는다.
- 병행 검증이 끝나기 전에 기존 수집 경로를 삭제하지 않는다.
- Google AIO 기본 가시성 전환과 YouTube 상세 기능의 완전 대체 판정을 분리한다.

## 14. 참고 API

- [DataForSEO Google Organic SERP](https://docs.dataforseo.com/v3/serp-google-overview/)
- [DataForSEO Google AI Mode SERP](https://docs.dataforseo.com/v3/serp-google-ai_mode-overview/)
- [DataForSEO Naver SERP](https://docs.dataforseo.com/v3/serp-naver-overview/)
