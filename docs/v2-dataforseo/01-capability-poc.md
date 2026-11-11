# Neodio V2 — DataForSEO 기능·운영 PoC 계획

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 초안 v0.1 |
| 작성일 | 2026-11-11 |
| 상위 문서 | `00-macro-plan.md` v0.3 |
| 목적 | DataForSEO가 기존 Google AIO·AI Mode 핵심 기능을 대체할 수 있는지 정량 검증하고 점진 전환 여부를 결정한다. |
| 범위 | PoC 설계와 판정 기준. 실제 구현, DB DDL, 운영 배포는 포함하지 않는다. |

## 1. 검증 결론의 단위

PoC는 DataForSEO 전체를 한 번에 승인하지 않는다. 다음 단위별로 `통과`, `조건부 통과`, `실패`, `미검증`을 판정한다.

- Google Organic SERP의 AIO
- Google AI Mode
- 비동기 AIO 로딩 옵션
- AI 답변 본문과 answer block
- 브랜드 언급 판정
- 자사·경쟁사 인용 판정
- Provider task 제출·callback·결과 회수
- 원본 보존·정규화·재처리
- 비용 수집·예상 비용 대사
- Naver 통합검색 AI 브리핑 후보

Google AIO·AI Mode 핵심 범위와 Naver·확장 API 판정을 분리한다. Naver AI 브리핑, Labs, Keywords, Trends, YouTube, Backlinks, Content Analysis, AI Optimization의 미통과는 핵심 전환을 자동으로 막지 않는다.

## 2. PoC 단계

```text
Stage A — 50개 기능 PoC
  → 필드 충족률·정확도·비용·재현성 검증
  → P0 구현 범위 확정

Stage B — 500~1,000개 운영 검증
  → 4회 이상 주간 병행 수집
  → callback·Recovery·예산·장애 복구 검증
  → 조직·표면 단위 전환 승인
```

Stage A가 통과하기 전에는 Provider 응답을 기준으로 DB 스키마나 고객 화면 지표를 확정하지 않는다. Stage B가 통과하기 전에는 기존 Collector를 제거하지 않는다.

## 3. Stage A — 50개 프롬프트 구성

### 3.1 질문 유형

| 질문 유형 | 수량 | 목적 |
| --- | ---: | --- |
| 브랜드형 | 10 | 자사·경쟁사 별칭, 조사 결합, 오탐 판정 |
| 비브랜드 정보형 | 10 | AI 답변 생성과 일반 출처 구조 확인 |
| 비교형 | 10 | 복수 브랜드 언급과 비교 문맥 확인 |
| How-to | 10 | 긴 답변, 단계·목록·표, 다중 인용 확인 |
| 구매·선정형 | 10 | 상업 의도, 추천·경쟁사 인용 확인 |

프롬프트는 현재 라이브러리에서 우선 선정하며 실제 고객·브랜드 분포를 반영한다. 동일 의미 중복 질문은 피하고, 기존 Collector에서 AI 답변이 자주 생성되는 질문과 생성되지 않는 질문을 모두 포함한다.

### 3.2 고정 조건

- 언어: 한국어
- 위치: 대한민국
- 기기: desktop, mobile
- 표면: Google AIO, Google AI Mode
- 기본 방식: Standard normal priority
- 비교 방식: 기존 Chrome Collector와 수동 화면 표본
- 수집 시각: 두 방식의 차이를 줄이도록 같은 검증 구간에서 실행
- 브랜드 판정 설정: PoC 시작 전에 브랜드명·별칭·제외어·자사 도메인·경쟁사 목록 고정

기본 요청 규모는 `50 프롬프트 × 2 표면 × 2 기기 = 200 관측`이다. 옵션 비교는 전체를 반복하지 않고 아래 표본을 추가한다.

| 옵션 검증 | 표본 | 비교 |
| --- | ---: | --- |
| AIO 비동기 로딩 | AIO 생성 가능성이 높은 20개 × 2기기 | 옵션 on/off의 present 판정·cost |
| Standard high | 유형별 2개, 총 10개 × 2기기 | normal 대비 처리 시간·cost |
| Live | 유형별 2개, 총 10개 × 2기기 | Standard 대비 필드·지연·cost |
| HTML·Screenshot | 유형별 2개, 총 10개 × 2기기 | 구조화 결과와 화면 증거 일치 |

## 4. 정답 데이터 작성

자동 비교만으로 정확도를 판정하지 않는다. 운영자 검토 표본에 다음 정답 항목을 기록한다.

| 항목 | 기록 방법 |
| --- | --- |
| AI 답변 존재 | present / absent / 판정 불가 |
| 답변 본문 | 핵심 문장 누락 여부와 추출 가능 여부 |
| 브랜드 언급 | 브랜드별 mentioned / not_mentioned와 근거 구간 |
| 인용 | 표시 순서, 원본 URL, 제목, 자사·경쟁사·기타 분류 |
| 요청 조건 | 언어·위치·기기·수집 시각 |
| 특수 요소 | 표, 목록, YouTube, 시작 구간, Markdown 링크 |

검토자는 Provider 결과를 보기 전에 수동 화면 또는 기존 Collector 결과를 판정하는 방식을 우선한다. 판정이 엇갈리면 원본 HTML·Screenshot과 수집 시각 차이를 확인하고 `정답 불확실`로 별도 분류한다. 정답 불확실 표본은 정확도 분모에서 제외하되 개수와 사유를 공개한다.

## 5. 원본과 정규화 검증

각 관측은 다음 증거를 연결할 수 있어야 한다.

```text
내부 Job ID
→ 제출 attempt와 payload hash
→ Provider tag·task ID·cost
→ Provider 원본 JSON / HTML / Screenshot 참조
→ 정규화된 answer / reference / SERP item
→ 브랜드·인용 분석 결과
→ normalizer_version / analysis_version
```

### 5.1 답변과 reference 정규화

- 답변 본문과 answer block을 분리한다.
- `references`, `items[].references`, Markdown 링크를 모두 후보로 수집한다.
- 원본 URL과 canonical URL을 함께 보존한다.
- 같은 canonical URL을 합쳐도 원본 field path, index, 표시 순서, 반복 위치를 보존한다.
- 자사 URL, 경쟁 URL, 기타 출처 분류를 별도로 기록한다.
- 브랜드 언급은 인용과 독립적으로 판정한다.

### 5.2 재현성

동일한 원본과 동일한 normalizer·analysis version으로 최소 두 번 재처리한다. 정렬 순서, canonical URL, 브랜드 언급, 인용 분류와 집계 결과가 완전히 같아야 한다. Provider 원본을 다시 호출하지 않고도 분석을 재생성할 수 있어야 한다.

## 6. 상태 모델 검증

각 시나리오에서 작업 상태와 관측 상태가 다음처럼 분리되는지 확인한다.

| 시나리오 | 작업 상태 | AI 답변 | 언급 | 인용 |
| --- | --- | --- | --- | --- |
| 답변에 자사 브랜드·URL 모두 있음 | succeeded | present | mentioned | cited |
| 답변은 있으나 브랜드·자사 URL 없음 | succeeded | present | not_mentioned | not_cited |
| 정상 결과이나 AI 답변 없음 | succeeded | absent | not_evaluated | not_evaluated |
| Provider 실패 | failed | unknown | not_evaluated | not_evaluated |
| 원본 저장 후 정규화 실패 | failed | unknown | not_evaluated | not_evaluated |
| 잔액·예산으로 연기 | deferred | unknown | not_evaluated | not_evaluated |
| 제출 결과 불명확 | submission_unknown | unknown | not_evaluated | not_evaluated |

실패에는 `submission`, `provider`, `result_fetch`, `raw_persist`, `normalization`, `analysis` 단계와 오류 코드를 기록한다. 원본이 저장된 이후 실패는 외부 task를 다시 만들지 않고 해당 내부 단계부터 재처리하는지 확인한다.

## 7. 제출·Callback·Recovery 검증

### 7.1 정상 흐름

1. 내부 Job과 attempt를 먼저 기록한다.
2. `submitting` 상태에서 내부 Job ID·attempt ID를 Provider `tag`에 포함한다.
3. Provider task ID·응답 원본·`cost`를 저장한다.
4. Callback은 인증 후 receipt와 완료 신호만 기록하고 신속히 2xx 응답한다.
5. 후속 처리가 결과를 조회하고 원본·정규화·분석을 완료한다.

### 7.2 장애 주입 시나리오

| 시나리오 | 기대 결과 |
| --- | --- |
| Callback 2회 전달 | receipt는 1건으로 처리되고 결과·분석 중복 없음 |
| Callback 유실 | Recovery Cron이 Tasks Ready·Task GET으로 회수 |
| Callback 처리 timeout | 저장된 receipt부터 재개하거나 Recovery가 회수 |
| task 제출 전 DB 실패 | 외부 요청 없음, queued 또는 failed로 복구 |
| 외부 task 생성 후 응답 timeout | submission_unknown, 즉시 재제출 금지 |
| Provider 응답 수신 후 DB 저장 실패 | tag·Tasks Ready로 기존 task 연결 후 cost 대사 |
| 결과 조회 중 일시 장애 | 같은 task ID 재조회, 새 과금 task 생성 금지 |
| 원본 저장 후 정규화 실패 | 저장 원본부터 재처리, 외부 재제출 금지 |
| 잔액 부족·rate limit | deferred 또는 retryable failure로 분류 |
| schema 변화 | parse failure 경보와 원본 기반 재처리 가능 |

DataForSEO가 idempotency key를 보장한다고 확인되기 전에는 네트워크 경계에서 중복 과금을 완전히 제거했다고 판정하지 않는다. 불명확한 제출을 찾을 수 있는 Provider 기능, 최대 대기 시간과 재제출 승인 절차를 PoC 결과에 포함한다.

## 8. 비용 검증

각 task에 다음 값을 기록해 예상 비용과 실제 비용을 비교한다.

- endpoint와 제품군
- Standard normal/high 또는 Live
- depth와 유료 옵션
- 공식 USD 단가와 가격 확인 시각
- 실제 task 응답 `cost`
- USD/KRW 환율과 환율 시각
- 조직·브랜드·프롬프트·표면
- 최초 제출 또는 재제출 attempt

기본 SERP, AI Mode, 비동기 AIO, HTML·Screenshot과 부가 API 비용은 분리한다. PoC에서는 부가 API의 대량 비용을 만들지 않고 Sandbox 또는 최소 표본으로 지원 범위와 응답 계약만 확인한다.

## 9. Stage A 정량 판정표

| 지표 | 계산 | 통과 기준 |
| --- | --- | ---: |
| Provider 최종 도달률 | 최종 결과 도달 task / 유효 요청 task | ≥ 98% |
| AI 답변 본문 추출률 | 추출 성공 / 수동으로 present 확인 | ≥ 95% |
| 인용 URL precision | 정답과 일치한 추출 URL / 추출 URL | ≥ 95% |
| 인용 URL recall | 정답과 일치한 추출 URL / 정답 URL | ≥ 95% |
| 인용 순서 일치율 | 올바른 위치의 인용 / 비교 가능한 인용 | ≥ 90% |
| 브랜드 언급 정확도 | 올바른 mention 판정 / 평가 가능 판정 | ≥ 95% |
| 요청 조건 보존율 | 위치·언어·기기 metadata 완전 / 유효 요청 | 100% |
| 비동기 AIO 상태 일치율 | 올바른 present·absent 판정 / 비교 가능 관측 | ≥ 95% |
| 실제 cost 저장률 | cost가 저장된 과금 task / 과금 task | 100% |
| 원본 저장률 | 원본 저장 성공 / 정상 수신 결과 | 100% |
| 재처리 재현율 | 동일 결과 / 동일 버전 재처리 | 100% |
| 설명되지 않은 중복 과금 | 원인·task 연결이 없는 중복 의심 | 0건 |

모든 비율은 분자·분모·제외 건수와 95% 신뢰구간을 함께 기록한다. 50개 표본에서 한 건의 영향이 크므로 비율만으로 결론 내리지 않고 실패 사례를 유형별로 검토한다.

## 10. Naver AI 브리핑 후보 PoC

Naver AI 브리핑은 Stage A 핵심 통과 범위와 분리된 후속 후보로 판정한다.

- DataForSEO Naver HTML에 통합검색 AI 브리핑 본문과 출처가 포함되는지 확인
- 브리핑이 있다고 수동 확인한 질의와 없다고 확인한 질의를 모두 포함
- 기존 `parse_naver_ai_html.py` selector와 추출 규칙의 재사용률 측정
- 통합검색 AI 브리핑과 별도 AI 검색 탭 구분
- 본문·출처·표·목록·링크 추출률과 DOM 변화 위험 기록
- DataForSEO `AI Summary` 결과를 Naver 노출 결과로 사용하지 않음

HTML에 필요한 데이터가 안정적으로 포함되지 않거나 정확도가 기준에 미달하면 기능을 보류하거나 다른 계약형 Provider를 검토한다. 신규 직접 Naver 브라우저 크롤러는 만들지 않는다.

## 11. Stage B — 500~1,000개 운영 검증

### 11.1 운영 조건

- 실제 운영 후보 프롬프트 500~1,000개
- 기본 주 1회
- 핵심 표면 Google AIO·AI Mode
- 최소 4회 연속 주간 실행
- 기존 Collector와 병행하되 고객 기본 지표는 기존 경로 유지
- 조직·브랜드별 예산과 비용 대사 적용
- Vercel Cron, Callback, Recovery Cron 사용

### 11.2 운영 판정표

| 지표 | 통과 기준 |
| --- | ---: |
| Recovery 이후 최종 성공률 | ≥ 99% |
| 완료 SLA 이후 고아 작업 | 0건 |
| callback 중복으로 생긴 중복 결과 | 0건 |
| 설명되지 않은 중복 과금 | 0건 |
| 원본 저장률 | 100% |
| 분석 재현률 | 100% |
| 예상-실제 비용 차이 | ≤ 5% 또는 차이 전부 설명 |
| P0 화면·API·확정 보고서 회귀 | 0건 |

처리 시간은 제품·priority별 p50과 p95를 측정하고 주간 수집 완료 목표를 정한다. 단순 평균으로 timeout과 긴 꼬리 지연을 숨기지 않는다.

## 12. 전환 판정과 증거

| 판정 | 조건 | 다음 조치 |
| --- | --- | --- |
| 통과 | 모든 P0 기준 충족 | Phase 3 점진 전환 후보 승인 |
| 조건부 통과 | 고객 핵심 기능에 영향 없는 제한만 존재 | 제한·대체 UI·재검증 일정 명시 후 일부 전환 |
| 실패 | 핵심 정확도·원본 보존·중복 과금·하위 호환 기준 미달 | 기존 Collector 유지, adapter 수정 후 재검증 |
| 미검증 | 표본·Provider 지원·계약 확인 부족 | 기능 노출 금지, 검증 backlog 유지 |

PoC 결과에는 다음 증거를 첨부한다.

- task ID와 내부 Job ID가 제거된 요약 표본
- 원본·정규화·분석 연결 검증 결과
- 실패 사례와 원인 분류
- 정확도 confusion matrix와 인용 URL 비교
- 비용 및 처리 시간 분포
- 장애 주입과 Recovery 결과
- 기존 Collector 대비 차이와 제품 영향
- 통과·조건부 통과·실패·미검증 결정 기록

## 13. 전환·롤백 게이트

Collector 제거 전 다음 항목을 모두 충족한다.

- Stage A와 Stage B 통과
- 핵심 기능 최소 4회 연속 안정성 기준 충족
- callback·제출 불명확·원본 저장 실패·Provider 장애 훈련 완료
- 기존 DB·화면·확정 보고서 하위 호환 검증 완료
- 비용 대사와 조직별 예산 알림 검증 완료
- 기능 flag를 이용한 조직·표면 단위 롤백 리허설 완료

전환 후 기준 미달, 원본 손실, 중복 과금, schema drift 또는 P0 회귀가 발생하면 해당 조직·표면의 신규 스케줄을 중지한다. Collector가 남아 있는 동안에는 기존 경로로 되돌리고, 제거 후에는 마지막 정상 snapshot 제공과 저장 원본 재처리·이전 adapter 복원·Provider 재조회로 복구한다.

## 14. PoC 종료 산출물

1. 기능별 통과·조건부 통과·실패·미검증 표
2. 50개 정답 데이터와 정확도 보고서
3. 500~1,000개 운영 안정성·비용 보고서
4. Provider 제품별 capability matrix
5. 상태·오류·Recovery 결과 보고서
6. 데이터 사용 권한 검토 기록
7. Phase 3 전환 대상과 보류 대상 목록
8. Collector 제거 또는 유지 결정서

