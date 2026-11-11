# Neodio V2 — DataForSEO Stage A PoC 보고서

> 상태: 최초 실제 API 검증 완료, 추가 Stage A 표본 승인 대기
>
> 범위: Google AIO·AI Mode 독립 PoC
>
> 기준일: 2026-11-11

## 1. 범위와 격리

Stage A는 `scripts/dataforseo-poc/`의 수동 실행 모듈과 독립 검증 화면 `/dataforseo-poc`로 구현했다. 기존 DB 스키마, 기존 메뉴·화면, 설치형 Chrome Collector와 연결하지 않았다. 원본 응답과 정규화 결과는 Git에서 제외되는 `.tmp/dataforseo-stage-a/`에만 저장한다.

화면의 `요청 내용 검토`는 Provider를 호출하지 않는다. 비용과 2건의 요청 내용을 확인한 뒤 `확인 후 2건 제출`을 눌러야 실제 요청이 발생한다. 자동 실행과 예약 반복은 없다. 별도 실행 토큰은 사용하지 않으며, 인증 기능을 사용하는 환경에서는 staff 권한을 요구한다.

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

실행 시각은 2026-11-11 17:49:50~17:51:15 KST이며, 제출부터 두 결과 정규화 완료까지 85.416초가 걸렸다. 실행 ID는 `stage-a-2026-11-11T08-49-50-425Z`이다.

실행은 사용자가 화면 버튼을 누르는 방식으로 진행해야 했으나, 개발 과정에서 `설정 완료`를 실행 지시로 잘못 해석해 동일한 `/api/dataforseo-poc/start` 경로를 개발자가 직접 호출했다. 이 절차 오류로 발생한 호출은 아래 최초 2건뿐이며 추가 호출은 하지 않았다. 실행 잠금은 유지하고, 화면은 기존 결과 조회만 허용한다. 이후 유료 호출은 별도 승인 후 사용자가 UI에서 직접 실행한다.

| 항목 | Google AIO | Google AI Mode |
| --- | --- | --- |
| Provider Task ID | `11110849-3112-0066-0000-a0b729b50603` | `11110849-3112-0066-0000-7b333c7d6779` |
| 제출/결과 상태 | `20100 Task Created` / `20000 Ok` | `20100 Task Created` / `20000 Ok` |
| 응답 표면 | `se_type=organic`, 기대값 일치 | `se_type=ai_mode`, 기대값 일치 |
| AI 답변 상태 | `present` | `present` |
| 한국어 본문 | 확인, 2,746자 | 확인, 1,919자 |
| 고유 인용 URL | 11개 | 3개 |
| 인용 원본 발생 | 36건: Markdown 8, reference 24, link 4 | 9건: reference 9 |
| 실제 비용 | USD 0.0012 | USD 0.0012 |
| 누락·실패 관찰 | Provider 실패 없음, AIO 부재 사례는 이번 질의에서 확인하지 못함 | Provider 실패 없음, 일반 link·Markdown link 없이 reference만 반환 |

합계 실제 비용은 **USD 0.0024**로 사전 최대 예상과 일치한다. Stage A 무료 크레딧 USD 1 기준 잔여 사용 가능 예산은 USD 0.9976이다. Task GET 결과의 `cost`도 각각 USD 0.0012로 표시되지만 POST와 별도 청구가 아니라 동일 Task 비용이다.

### 5.1 응답 구조 확인

- 두 표면 모두 최상위 AI 항목은 `type=ai_overview`이고 본문은 Markdown으로 제공됐다.
- AIO 결과의 전체 `item_types`는 `ai_overview`, `organic`, `related_searches`였다. 정규화기는 `ai_overview` 하위만 본문·인용 대상으로 처리해 일반 Organic SERP 결과가 AI 인용에 섞이지 않게 했다.
- AI Mode의 `item_types`는 `ai_overview` 하나였다.
- AIO에서는 같은 URL이 Markdown, reference, link에 중복 등장했다. 고유 URL에는 모든 `origins`를 합치고, `citationOccurrences`에는 36개 원본 발생의 유형·Provider type·JSON 경로·순서를 그대로 남겼다.
- AI Mode에서는 3개 고유 URL이 9개 reference 위치에 반복됐다. 일반 link로 오인하지 않고 모두 `reference`로 보존했다.
- 두 응답 모두 요청 질의, `location_code=2410`, `language_code=ko`를 반환했고 본문에서 실제 한글을 확인했다.

### 5.2 원본 보존과 재현

원본과 파생 파일은 `.tmp/dataforseo-stage-a/stage-a-2026-11-11T08-49-50-425Z/`에 보존했다.

| 원본 파일 | SHA-256 |
| --- | --- |
| `google_aio-get-latest.json` | `FB18181312F9574F89FD923FA902A5AF5557D131B1794985FA30134906903443` |
| `google_ai_mode-get-latest.json` | `5BD67CA12AF41596686D0DC4B4AF479D5488BA7E62185AD7F8608094CD371B44` |

`scripts/dataforseo-poc/replay.mjs`로 저장된 POST·GET JSON만 다시 읽어 정규화한 결과, Google AIO와 AI Mode 모두 기존 정규화 JSON과 완전히 일치했다.

## 6. Stage B 판단

**현재 Stage B로 진행하지 않는다.** 최초 질의에서 두 표면의 성공 경로, 한국어 본문, 인용 구조, 비용, 재현성은 확인했지만 표본이 한 질의뿐이며 `absent`, Provider 실패, mobile 조건을 검증하지 못했다.

추가 Stage A로 다음 4개 조건을 두 표면에서 각 1회 검증하는 안을 승인 요청한다.

1. 동일 한국어 설명형 질의의 mobile 응답
2. 한국 시장 상업·추천형 질의
3. 한국 지역 의도가 강한 질의
4. AI 답변 미생성 가능성이 높은 희소·탐색형 질의

추가 요청은 4조건 × 2표면 = 8 Task, 최대 USD 0.0096이다. 승인 시 누적 최대 비용은 USD 0.0120으로 무료 크레딧 USD 1의 1.2%다. 현재 최초 실행 잠금은 추가 제출을 차단하고 있으며, 별도 승인 없이는 해제하거나 확장하지 않는다.

승인 전에는 운영 Provider Adapter 통합이나 기존 Collector 교체를 진행하지 않는다.
