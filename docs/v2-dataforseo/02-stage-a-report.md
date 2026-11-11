# Neodio V2 — DataForSEO Stage A PoC 보고서

> 상태: 구현 완료, 실제 API 검증 대기
>
> 범위: Google AIO·AI Mode 독립 PoC
>
> 기준일: 2026-11-11

## 1. 범위와 격리

Stage A는 `scripts/dataforseo-poc/`의 수동 실행 모듈과 독립 검증 화면 `/dataforseo-poc`로 구현했다. 기존 DB 스키마, 기존 메뉴·화면, 설치형 Chrome Collector와 연결하지 않았다. 원본 응답과 정규화 결과는 Git에서 제외되는 `.tmp/dataforseo-stage-a/`에만 저장한다.

화면의 `요청 내용 검토`는 Provider를 호출하지 않는다. 비용과 2건의 요청 내용을 확인한 뒤 `확인 후 2건 제출`을 눌러야 실제 요청이 발생한다. 자동 실행과 예약 반복은 없다. 서버 환경변수와 화면 입력값의 실행 토큰이 일치해야 하며, 인증 기능을 사용하는 환경에서는 staff 권한을 추가로 요구한다.

현재 수집 경로는 다음과 같다.

- Google AIO: `scripts/collect-google-aio.mjs`를 Playwright 기반 수집 경로와 YouTube AIO 판정에서 사용한다.
- Google AI Mode: `scripts/collect-google-ai.mjs`를 설치형 Collector와 수동 수집 작업에서 사용한다.
- 설치형 Collector: `collector/agent.ts`가 각 수집 스크립트를 실행하고 결과를 기존 import·분석 경로로 전달한다.
- 신규 PoC: 위 경로를 호출하거나 수정하지 않고 DataForSEO API와 로컬 파일만 사용한다.

## 2. 실행 전 비용 계획

| 표면 | 요청 | 수량 | 최대 예상 비용 |
| --- | --- | ---: | ---: |
| Google Organic SERP Advanced | Standard Task, `load_async_ai_overview=true` | 1 | USD 0.0012 |
| Google AI Mode Advanced | Standard Task | 1 | USD 0.0012 |
| 합계 |  | 2 | **USD 0.0024** |

Stage A 무료 크레딧 USD 1의 0.24%에 해당한다. Priority, Live, `calculate_rectangles`, 추가 검색 깊이와 자동 반복은 사용하지 않는다. 코드가 정확히 두 Task와 USD 0.0024 확인값만 허용한다.

서버는 최초 실행 전에 로컬 잠금 파일을 원자적으로 생성한다. 이 잠금은 프로세스가 재시작되어도 유지되며 첫 실행이 일부 실패해도 자동 해제하지 않는다. 따라서 승인된 최초 2건 이후의 유료 제출은 별도 검토 없이 실행할 수 없다. CLI는 계획 확인만 지원하고 유료 제출은 UI 경로 하나로 제한한다.

## 3. 검증 조건

- 질의: `생성형 AI란 무엇이며 기업에서 어떻게 활용할 수 있나요?`
- 위치: `South Korea`
- 언어: `ko`
- 기기: `desktop`
- 실행: Standard queue
- 보존 대상: 요청 payload, Task POST 원본, Task GET 원본, 정규화 결과, 통합 요약

## 4. 추출 계약

- 작업 상태: Provider 결과 성공은 `succeeded`, Provider 오류는 `failed`, 판정 불가는 `unknown`
- AI 답변 상태: 성공 응답의 `ai_overview` 존재 여부를 `present`/`absent`로 기록하고 Provider 실패는 `unknown`으로 유지
- 본문: `ai_overview.markdown`을 우선하고 없으면 하위 항목의 Markdown·텍스트를 원래 순서대로 결합
- 인용: `references`, 하위 reference, link, Markdown 링크를 순회하고 URL fragment를 제거해 URL별로 정규화
- 인용 원본: 모든 발생 건을 `citationOccurrences`에 별도로 저장해 `reference`·`link`·`markdown`, Provider `type`, 원래 JSON 경로와 순서를 보존
- 추적 정보: Provider Task ID, 상태 코드·메시지, POST 응답의 실제 `cost`, 결과 응답의 `cost`
- 표면 검증: AIO는 응답 `se_type=organic`, AI Mode는 `se_type=ai_mode`인지 별도로 기록하고 기대 표면과 일치 여부를 판정

## 5. 실제 결과

API 인증정보가 실행 환경에 준비되면 아래 표를 실제 응답으로 갱신한다.

| 항목 | Google AIO | Google AI Mode |
| --- | --- | --- |
| Provider Task ID | 대기 | 대기 |
| 작업 상태 | 대기 | 대기 |
| AI 답변 상태 | 대기 | 대기 |
| 한국어 본문 | 대기 | 대기 |
| 인용 URL 수 | 대기 | 대기 |
| 실제 비용 | 대기 | 대기 |
| 누락·실패 관찰 | 대기 | 대기 |

## 6. Stage B 판단

실제 응답 확보 전이므로 Stage B 진행 여부는 아직 판정하지 않는다. 두 표면의 한국어 본문과 인용 구조, 실패·누락 사례, 실제 비용을 채운 뒤 기술 책임자가 다음 항목을 검토한다.

- 응답 구조로 본문과 인용을 안정적으로 재현할 수 있는가
- AIO 미생성과 Provider 실패를 구분할 수 있는가
- 한국어·대한민국 조건의 결과 품질이 운영 검증에 충분한가
- 실제 비용이 공식 예상과 일치하는가
- 원본 응답만으로 정규화 결과를 다시 생성할 수 있는가

원본 재현은 `scripts/dataforseo-poc/replay.mjs`가 저장된 POST·GET JSON만 다시 읽어 정규화하고 기존 결과와 완전 일치하는지 검증한다.

승인 전에는 운영 Provider Adapter 통합이나 기존 Collector 교체를 진행하지 않는다.
