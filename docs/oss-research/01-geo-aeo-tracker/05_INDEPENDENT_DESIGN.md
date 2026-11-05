# 05. INDEPENDENT_DESIGN — Neodio 독립 설계 명세 (프로젝트 1 결과)

> 이 문서는 **원본 소스·파일명·식별자·임계값을 참조하지 않는다.** 승인된 기능 요구사항(04의 I1~I3)만을 입력으로 한 독립 설계다.
> 구현 아님. 모든 수치는 "초기 제안값 — 보정 실험으로 결정"이다.
> 한계: 04와 같은 세션에서 작성되어 엄격한 Clean-Room이 아니다(06 §4).

---

## D1. 비용 거버너 (Cost Governor)

**목표**: LLM 호출 비용을 조직·기간 단위로 통제하고, 실행 전에 예상 비용을 보여준다.

**요구사항**
- R1 호출 전 예상 비용 산출(모델 단가 × 예상 입력/출력 토큰)
- R2 조직별 일/월 한도, 초과 시 차단 또는 축소 실행 선택
- R3 실행 후 실제 비용 기록(제공자가 응답에 비용을 주면 우선, 없으면 토큰×단가)
- R4 서버 인스턴스가 여럿이어도 한도가 정확히 지켜질 것
- R5 단가표에 없는 모델은 실행 거부(조용히 0원 처리 금지)

**설계**
- 방식: "예약 → 정산". 실행 시작 때 예상치를 원장에 예약(reserve)하고 완료 시 실비로 확정(settle), 취소/실패 시 해제.
- 원자성: DB 트랜잭션에서 `기간 합계 + 예약 ≤ 한도`를 검사한 뒤 예약 행을 삽입(직렬화 가능 수준 또는 조직 행 잠금).

**데이터 모델(제안)**
- `llm_price_table(model_id, input_per_mtok, output_per_mtok, effective_from)` — 단가 이력 보존
- `llm_budget(organization_id, period_type, limit_usd)`
- `llm_spend_ledger(id, organization_id, job_id, model_id, state[reserved|settled|released], estimated_usd, actual_usd, created_at)`

**인터페이스(제안)**
- `reserve(org, model, estimatedTokens) → {ok, reservationId, remaining} | {denied, reason}`
- `settle(reservationId, usage)` / `release(reservationId)`
- `previewCost(plan) → {low, high}` (UI 표시용)

**검증**: 동시 100건 예약에서 합계가 한도를 넘지 않음, 비정상 종료 후 만료 예약 정리, 단가 변경 이후 과거 기록 불변.

---

## D2. 변화 신뢰도 표시 (Change Confidence)

**목표**: 주간 지표 변화가 표본 크기에 비해 의미 있는지 표시한다.

**요구사항**
- R1 입력은 기존 주간 집계(가중 언급 수, 가중 전체 실행 수)
- R2 출력은 변화량과 신뢰구간, 라벨(유의/노이즈 가능/표본 부족)
- R3 구간 방법은 소표본에서 안정적인 비율 구간(예: Wilson 또는 Bayesian credible interval)을 후보로 비교해 선택
- R4 표본이 최소 기준 미만이면 변화율을 숫자로 크게 보여주지 않는다

**데이터**: 별도 저장 없이 읽기 시점에 계산(저장하지 않아 정의 변경 시 과거도 일관).

**검증**: 과거 데이터에서 변화가 없다고 알려진 구간(같은 설정 연속 주)으로 거짓 양성률 측정, 후보 구간 방법 간 비교 후 선택.

---

## D3. 콘텐츠 영향 실험 엔진 (Content Effect Lab)

**목표**: "텍스트의 특정 특징이 AI의 선택에 영향을 주는가"를 통제된 대조 실험으로 검증하고, 그 근거 강도를 기회 카드에 연결한다.

**요구사항**
- R1 실험 단위 = (질의, 문단 쌍, 특징). 쌍은 특징 외 모든 내용이 동일해야 한다
- R2 쌍 생성 시 **자동 통제 검사**(길이 편차, 숫자·고유명사 보존, 의미 보존)를 통과해야 시행에 사용
- R3 판정 시 출처 단서(URL, 도메인, 제목)를 제거하고 제시 순서를 무작위화(위치 편향 제거)
- R4 위약 대조 포함: 의미를 바꾸지 않는 편집만으로 판정이 얼마나 움직이는지 기준선으로 보고
- R5 다중 판정 모델 사용 시 모델 간 불일치율 보고
- R6 한국어·영어(필요 시 일본어) 문단 지원
- R7 중간 확인 시점을 사전에 고정하고 그 시점에서만 종료 판단(관측 중 임의 중단 금지)
- R8 여러 특징을 동시에 검증하면 다중 비교 보정을 적용
- R9 **보정 단계**: 판정 모델의 선호를 Neodio가 수집한 실제 인용 데이터와 대조해 일치도를 기록, 일치도가 낮으면 결과에 "대리 지표 신뢰 낮음" 표시
- R10 특징 정의에 버전을 부여, 버전이 다른 결과는 합산하지 않음
- R11 모든 호출은 D1 거버너를 통과

**데이터 모델(제안)**
- `effect_feature(id, version, name, direction_rule, control_rules_json)`
- `effect_experiment(id, organization_id, brand_id, query, feature_id, feature_version, judge_models, config_snapshot, status)`
- `effect_trial(id, experiment_id, passage_ref, variant_a, variant_b, order_seed, judge_model, choice, valid, reject_reason, cost_usd)`
- `effect_result_view` — 저장하지 않고 읽기 시점에 구간·판정 산출

**인터페이스(제안)**
- `proposeExperiment(brand, query, features) → plan(+cost preview)`
- `runExperiment(plan) → stream(progress)`
- `getResult(experimentId) → {effect, interval, placeboBaseline, judgeAgreement, calibration, label}`

**검증**: (a) 효과가 없다고 알려진 위약에서 양성 판정이 임계 비율 이하, (b) 효과가 있다고 알려진 대조 특징에서 양성, (c) 판정 순서 뒤집기에 결과 불변.

**위험/비목표**: 실제 AI 검색 결과를 보장하지 않는다. UI 문구는 "AI 판정 모델 기준 추정"으로 표기(내부 구현 노트를 사용자 문구에 넣지 않는 원칙에 맞춰, 사용자 화면에는 "추정 신뢰도"로만 노출).

---

## 단계 제안 (구현 아님, 순서 제안)

1. D2 (데이터 이미 있음, 비용 낮음)
2. D1 (D3의 선행 조건, 기존 AI 생성 기능에도 즉시 이득)
3. D3 (보정 실험이 선행되어야 하므로 별도 연구 트랙)
