# 05. INDEPENDENT_DESIGN — Neodio 독립 설계 명세 (프로젝트 2 결과)

> **원본 소스·파일명·식별자·프롬프트 문구·점수 차원 이름·임계값을 참조하지 않는다.** 04의 I1·I2·(I3)만을 입력으로 작성.
> 구현 아님. 수치는 "초기 제안 — 보정으로 결정".
> 한계: 04와 같은 세션에서 작성(엄격한 Clean-Room 아님, 06 §4). **구현은 이 문서만 가지고 새 세션에서 시작할 것.**

---

## D4. 답변 평가기 (Answer Evaluator)

**목표**: 수집된 AI 응답에서 브랜드별 추천 여부·순위·입장·사실 정오를 **원문 근거와 함께** 구조화하되, 검증 가능하고 비용이 통제되게 한다.

**요구사항**
- R1 자사·경쟁사를 **동일한 탐지 방법**으로 처리한다(후보 탐지는 기존 규칙 매칭, 판정은 평가기).
- R2 규칙 단계에서 "대상 브랜드가 하나도 안 나온" 응답은 평가기를 호출하지 않는다(비용 절감).
- R3 평가기 출력의 모든 판단은 **원문에서 잘라낸 근거 구간**을 포함해야 한다. 구간이 원문에 정확히 존재하지 않으면 해당 판단을 무효 처리하고 재시도(최대 1회) 또는 "검증 실패"로 기록.
- R4 출력 스키마: 브랜드별 {언급 확정, 추천(예/아니오/불명), 순위(없으면 null), 입장(긍정/중립/부정/불명), 근거 구간, 확신도}, 응답 수준 {비교 구조 여부, 추천 목록 총개수}
- R5 평가 버전 = (평가 지침 버전, 모델, 온도, 스키마 버전). 모든 결과에 기록. 버전이 다른 결과는 지표를 합칠 때 분리하거나 재평가 후 합산.
- R6 한국어·영어·일본어 응답 지원. 언어별 골드셋으로 별도 보고.
- R7 배치 비용은 D1(프로젝트 1) 거버너를 통과한다.
- R8 평가 결과는 기존 `brand_observations`의 규칙 기반 값을 **덮어쓰지 않고** 별도 계열로 저장하고, 두 방법의 불일치율을 모니터링한다.

**데이터 모델(제안)**
- `eval_profile(id, version, model_id, temperature, schema_version, instruction_hash)`
- `answer_evaluation(id, organization_id, prompt_run_id, eval_profile_id, status, cost_usd, created_at)`
- `answer_evaluation_item(evaluation_id, brand_id, mentioned, recommended, rank, stance, confidence, evidence_start, evidence_end, evidence_verified)`
- `eval_gold_label(id, prompt_run_id, brand_id, labeled_by, recommended, rank, stance, locale)`

**인터페이스(제안)**
- `evaluate(promptRunId, profile) → AnswerEvaluation | skipped(reason)`
- `evaluateBatch(filter, profile, budget) → job`
- `measureProfile(profile, goldSetFilter) → {precision, recall, kappa, byLocale}`

**검증**
- 골드셋: 로케일별 최소 N건(초기 제안 200)을 사람이 이중 라벨, 평가자 간 일치도 먼저 측정(일치도가 낮으면 지침부터 수정)
- 근거 구간 존재율 100% 강제, 환각 구간 비율 보고
- 새 평가 버전 도입 시 골드셋 회귀 통과가 배포 조건
- 규칙 vs 평가기 불일치 샘플링 점검

**지표 반영 원칙(정확도 우선)**: 골드셋 기준 목표 정밀도를 만족하기 전에는 점수에 넣지 않고 **별도 지표로만 표시**한다. 기존 감성 처리 원칙과 동일.

---

## D5. 내구성 있는 수집 잡 엔진 (Durable Job Engine)

**목표**: 정기·수동 수집을 재시작에도 살아남게 하고, 조직 간 공정하며 멱등하게 실행한다.

**요구사항**
- R1 잡 상태는 DB에 영속(대기/실행/완료/실패/취소), 진행률·로그 요약 저장
- R2 **멱등 키**: (조직, 프롬프트, 엔진, 마켓, 일자[, 표본 번호])가 같으면 중복 실행하지 않는다. 의도적 반복 표본은 표본 번호로 구분.
- R3 정기 실행 정의는 한 곳에 있고, 여러 인스턴스가 동시에 떠도 같은 정기 실행이 한 번만 만들어진다.
- R4 워커는 동시에 여럿이어도 같은 작업을 집지 않는다(행 단위 점유 + 만료 시 회수)
- R5 조직별 동시 실행 수 상한과 라운드로빈 공정성
- R6 재시도: 일시 오류(제한/서버 오류)만 지수 백오프, 영구 오류(인증, 정책 거부)는 즉시 실패. 재시도 횟수 상한
- R7 **"아무것도 실행되지 않았다"는 성공이 아니라 실패**로 기록하고 이유(필터됨/설정 없음/예산 초과)를 표시
- R8 수동 취소는 진행 중 작업을 안전하게 중단하고 부분 결과는 보존
- R9 D1(비용 거버너) 예약 실패 시 해당 작업은 "예산 초과"로 건너뜀(실패와 구분)

**데이터 모델(제안)**
- `job_schedule(id, organization_id, kind, cadence, enabled, next_run_at)`
- `job(id, organization_id, kind, state, idempotency_key UNIQUE, attempt, max_attempts, locked_by, lock_expires_at, progress_json, result_json, error_class)`
- `job_task(job_id, task_key, state, attempt, error_class)` — 부분 실패 격리 단위

**인터페이스(제안)**
- `enqueue(kind, orgId, payload, idempotencyKey)` → 이미 있으면 기존 반환
- `claim(workerId, limit)` → 점유한 작업(조직 공정성 적용)
- `complete / fail(errorClass) / cancel`
- `tick()` → 도래한 `job_schedule`로부터 잡 생성(중복 생성 방지)

**검증**: 워커 N개 × 잡 M개에서 중복 실행 0, 강제 종료 후 회수·재개, 한 조직의 대량 잡이 다른 조직 지연에 주는 영향 측정, 멱등 키 충돌 처리.

---

## D6. (후속 후보) 브랜드 사실 정확도

D4의 확장: 브랜드가 확정한 사실 목록에 대한 일치/불일치 판정. 사실 입력 UX(사이트 크롤 기반 초안 제안)와 정확도 목표가 정해진 뒤 별도 설계. 이번 범위에서는 **요구사항만 기록**한다.

---

## 단계 제안 (구현 아님)

1. D5 (스케일 기반, 다른 기능의 전제)
2. D4 골드셋 구축부터 → 평가기 개발 (정확도 우선 원칙)
3. D6은 D4의 신뢰도가 확인된 뒤
