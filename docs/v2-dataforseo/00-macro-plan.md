# Neodio V2 — DataForSEO 전환 거시 계획

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 초안 v0.3 · 점진 전환, 상태·과금 안전성, PoC 게이트 보완 |
| 작성일 | 2026-11-11 |
| 목적 | 현재 메뉴 전체를 기준으로 DataForSEO 도입 효과와 V2 전환 방향을 정한다. |
| 범위 | 제품·데이터·운영 구조의 거시 계획. 상세 API 계약, DB DDL, 화면 와이어프레임은 후속 문서에서 다룬다. |

## 1. 결론

V2는 외부 검색·AI 표면 관측을 로컬 Chrome 중심 구조에서 DataForSEO 중심 구조로 점진 전환한다. 기존 기능·화면·수집 이력·분석 데이터는 최대한 유지하고, PoC와 병행 비교에서 동등성 및 운영 안정성이 확인된 표면부터 전환한다. 불필요한 구조 변경이나 기능 제거를 전환의 전제로 삼지 않는다. 데이터 성격에 따라 다음 세 계층을 유지한다.

1. **DataForSEO 시장 관측 데이터**: Google AIO·AI Mode·일반 SERP, 키워드·트렌드, YouTube SERP, 백링크 및 외부 콘텐츠 데이터.
2. **고객 소유 실측 데이터**: GSC 검색 노출·클릭·CTR, 향후 YouTube·Analytics·CDN의 고객 소유 콘솔 데이터.
3. **Neodio 자사 진단 데이터**: 고객이 등록한 사이트의 사이트맵 크롤, robots.txt, 구조화 데이터, 콘텐츠 가독성 및 변경 이력.

DataForSEO는 외부 시장 관측의 목표 기본 공급원으로 사용한다. 같은 화면에서도 `외부 시장 관측`, `고객 실측`, `사이트 진단`을 구분하고 결과의 출처와 수집 시각을 표시한다. DataForSEO가 지원하지 않는 신규 외부 표면을 위해 브라우저 수집을 새로 만들지 않으며, 기능 보류 또는 다른 계약형 API 검토 대상으로 둔다.

V2의 핵심 가치는 API 연결 자체가 아니라 다음 흐름을 한 제품에서 닫는 것이다.

```text
시장 수요 발견
→ 추적 프롬프트 선정
→ AIO·AI Mode·LLM 노출 측정
→ 인용 출처와 경쟁사 분석
→ 개선할 자사 URL과 콘텐츠 결정
→ 작업·변경 기록
→ 재수집 및 GSC 성과 검증
→ 고객 리포트
```

### 1.1 확정된 운영 결정

- 외부 SERP·AI·YouTube·웹 시장 데이터는 DataForSEO를 주 경로로 사용한다.
- 기존 Google AIO·AI Mode Chrome Collector는 50개 기능 PoC와 500~1,000개 운영 검증, 병행 비교, 롤백 준비가 끝난 뒤 운영 경로에서 제거한다.
- 주 수집 주기는 기본 주 1회로 한다.
- 비용 정책은 DataForSEO 공식 USD 단가와 실제 task 응답의 `cost`를 기준으로 하며, 원화는 시점이 기록된 환율을 적용한 표시값으로만 사용한다.
- GSC는 유지한다. DataForSEO가 제공하지 못하는 고객 사이트의 실제 클릭·노출·CTR을 제공하기 때문이다.
- 사이트맵·robots.txt·구조화 데이터·콘텐츠 렌더링 진단은 유지한다. 이는 외부 시장 관측이 아니라 고객이 분석을 요청한 자사 사이트 진단이다.
- DataForSEO 미지원 표면을 위해 Neodio 직접 브라우저 수집을 새로 개발하지 않는다.
- 기존 수집 이력과 분석 결과는 삭제·덮어쓰기하지 않고 수집 방식 버전과 함께 보존한다.

### 1.2 v0.3 주요 변경 결정

- 일괄 교체가 아니라 `50개 기능 PoC → P0 기반 구현 → 500~1,000개 병행 운영 → 핵심 기능 점진 전환` 순서로 바꾼다.
- 작업 상태, AI 답변 상태, 브랜드 언급, 자사 인용을 독립 축으로 관리한다.
- DB Unique Key만으로 외부 중복 과금을 막을 수 있다고 보지 않고 제출 attempt, Provider `tag`, `submission_unknown`, 비용 대사를 도입한다.
- Callback은 인증·멱등 수신과 ready 기록까지만 수행하고 결과 회수·정규화·분석은 후속 처리한다.
- 지표마다 분자·분모·제외 사유를 고정하며 기존 Collector와 DataForSEO 시계열에 수집 방식 버전을 표시한다.
- 비용은 공식 USD 단가와 실제 task `cost`로 관리하고 부가 API 비용을 기본 SERP 비용과 분리한다.
- 네이버 AI 브리핑은 확정 기능이 아니라 후속 PoC 검증 후보로 유지한다.
- Collector 제거는 병행 운영·비용 대사·장애 훈련·롤백 리허설을 모두 통과한 뒤 수행한다.

## 2. DataForSEO에서 활용할 제품군

| DataForSEO 제품군 | V2 활용 목적 | 비고 |
| --- | --- | --- |
| Google Organic SERP Advanced | AIO, organic, PAA, 관련 검색, 영상, 쇼핑 등 SERP 전체 구조 | AIO 비동기 로딩은 `load_async_ai_overview` 사용 여부와 비용을 검증해야 한다. |
| Google AI Mode SERP | AI Mode 답변, 인용 링크, 위치·언어별 결과 | 한국어·한국 위치의 실제 반환 품질을 PoC에서 확인한다. |
| Naver Organic SERP Advanced / HTML | 네이버 일반 SERP와 통합검색 AI 브리핑 후보 데이터 | AI 브리핑 전용 구조화 타입은 없으므로 원본 HTML에 브리핑 본문·출처가 포함되는지 PoC하고 Neodio normalizer에서 파싱한다. |
| DataForSEO Labs | 관련 키워드, 키워드 아이디어, 검색량, 난이도, 경쟁 도메인 및 SERP 데이터 | 프롬프트 리서치와 전략의 핵심 보강원이다. |
| Keywords Data / Google Trends | 검색량과 상대 트렌드, 관련 토픽·쿼리 | 기존 자체 추정 트렌드와 구분한다. |
| AI Optimization | LLM 응답·스크래핑, AI 키워드 데이터, LLM mentions | 플랫폼·언어·지역별 지원 범위가 달라 직접 수집의 대체 여부를 개별 검증한다. |
| YouTube SERP | YouTube 검색 결과, 영상 정보, 자막, 댓글 | 영상 관리와 AIO 인용 분석을 보강한다. |
| Backlinks API | 인용 URL과 경쟁 콘텐츠의 링크 권위 및 신규·소실 링크 | URL 인스펙터와 소스 기회의 우선순위에 사용한다. |
| Content Analysis | 외부 웹의 브랜드 언급·감성·인용 추세 | AI 답변 감성과 혼합하지 않고 별도 신호로 사용한다. |
| SERP HTML / Screenshot | 파싱 결과 검증과 운영 증거 | Google에서는 표본 감사에 제한한다. Naver AI 브리핑은 구조화 응답이 없으므로 HTML이 운영 원본이 될 수 있다. |

공식 문서:

- [Google SERP API 개요](https://docs.dataforseo.com/v3/serp-google-overview/)
- [Google AI Mode SERP 개요](https://docs.dataforseo.com/v3/serp-google-ai_mode-overview/)
- [Naver SERP API 개요](https://docs.dataforseo.com/v3/serp-naver-overview/)
- [AI Optimization API 개요](https://docs.dataforseo.com/v3/ai_optimization-overview/)
- [DataForSEO Labs 개요](https://docs.dataforseo.com/v3/dataforseo_labs-google-overview/)
- [Keywords Data API 개요](https://docs.dataforseo.com/v3/keywords-data-overview/)
- [Google Trends API 개요](https://docs.dataforseo.com/v3/keywords_data-google_trends-overview/)
- [YouTube SERP API 개요](https://docs.dataforseo.com/v3/serp/youtube/overview/)
- [Backlinks API 개요](https://docs.dataforseo.com/v3/backlinks-overview/)
- [Content Analysis API 개요](https://docs.dataforseo.com/v3/content_analysis-overview/)
- [DataForSEO 공식 가격](https://dataforseo.com/pricing)

### 2.1 주 1회 수집 비용 기준

예산은 원화 고정 단가가 아니라 산정 시점의 DataForSEO 공식 USD 가격표를 기준으로 계산한다. endpoint, method, priority, depth, `load_async_ai_overview` 같은 유료 옵션을 요청 조건과 함께 저장하고, 완료 응답의 실제 `cost`와 대사한다. 원화 환산값에는 환율과 환율 기준 시각을 남긴다.

```text
예상 비용(USD)
  = Σ(공식 endpoint 단가 × task 수 × priority/depth/유료 옵션)

실제 비용(USD)
  = Σ(provider task 응답 cost)

표시 비용(KRW)
  = 실제 또는 예상 비용(USD) × 기록된 USD/KRW 환율
```

비용 원장은 다음 항목을 분리한다.

1. **기본 관측 비용**: Google Organic SERP + AIO, Google AI Mode, Naver SERP.
2. **수집 방식 비용**: Standard normal/high priority, Live, 비동기 AIO 로딩, depth, HTML·Screenshot.
3. **부가 데이터 비용**: Labs, Keywords Data, Google Trends, YouTube, Backlinks, Content Analysis, AI Optimization.
4. **운영 비용**: 재시도 중 실제 재제출, 수동 즉시 수집, PoC·품질 감사 표본.

조직별로 월 예산, 경고선, 하드 제한 여부를 두고 `잔액 부족`, `예산 연기`, `Provider 과금 오류`, `예상-실제 차이`, `중복 제출 의심`을 구분한다. 잔액 부족이나 예산 초과는 작업을 `deferred`로 남기며 실패나 미노출로 집계하지 않는다. 공식 단가가 바뀌어도 과거 비용을 재계산하지 않도록 가격표 기준 시각과 실제 `cost`를 함께 보존한다.

## 3. 전환 원칙

### 3.1 원본과 분석 결과를 분리한다

DataForSEO 원본 응답은 변경 없이 보존하고 Neodio의 정규화 결과를 별도로 만든다.

```text
provider_task
  → provider_raw_response
  → normalized_run
  → mentions / citations / rankings / opportunities
  → 화면 집계와 보고서
```

Provider의 파서나 응답 계약이 바뀌어도 원본에서 다시 정규화할 수 있어야 한다.

### 3.2 요청형 관측과 시장 데이터셋을 섞지 않는다

다음 두 수치는 의미가 다르므로 같은 분모로 합산하지 않는다.

- 우리가 등록한 프롬프트를 특정 시각·조건으로 DataForSEO에 요청한 결과
- DataForSEO LLM Mentions 데이터셋이 추정·집계한 시장 지표

화면에서는 `추적 프롬프트 실측`과 `시장 전체 추정`을 탭 또는 카드로 분리한다.

### 3.3 데이터 출처를 모든 결과에 남긴다

최소 공통 필드는 다음과 같다.

```text
provider
provider_product
provider_task_id
surface
requested_location
requested_language
requested_device
requested_at
provider_collected_at
received_at
is_cached
raw_response_id
normalizer_version
```

### 3.4 미측정, 미노출, 실패를 구분한다

하나의 상태 값에 작업 성공, AI 답변 생성, 브랜드 언급과 인용을 섞지 않는다. 다음 축을 독립적으로 저장하고 집계한다.

| 축 | 값 | 의미 |
| --- | --- | --- |
| 작업 상태 | `queued` / `submitting` / `submission_unknown` / `running` / `succeeded` / `failed` / `deferred` | 내부 작업의 제출·실행·복구 상태. `deferred`는 예산·잔액·정책으로 연기된 상태다. |
| AI 답변 상태 | `present` / `absent` / `unknown` | Provider 결과에서 해당 AI 답변이 확인됐는지 나타낸다. 작업 실패·파싱 실패·미지원 조건은 `unknown`이다. |
| 브랜드 언급 상태 | `mentioned` / `not_mentioned` / `not_evaluated` | 답변 본문을 정상 평가했을 때만 앞의 두 값을 사용한다. |
| 자사 인용 상태 | `cited` / `not_cited` / `not_evaluated` | 인용 목록을 정상 평가했을 때만 앞의 두 값을 사용한다. |

경쟁사 언급과 경쟁사 인용도 같은 평가 규칙을 사용하되 브랜드별 결과로 보존한다. 예를 들어 AI 답변이 생성되지 않았다면 `작업=succeeded`, `AI 답변=absent`, `브랜드 언급=not_evaluated`, `자사 인용=not_evaluated`가 된다. Provider 실패라면 `작업=failed`이고 나머지는 `unknown` 또는 `not_evaluated`다. 화면의 `0`은 반드시 이 축을 확인한 뒤 표시한다.

`failed`에는 `failure_stage`와 `error_code`를 함께 둬 `submission`, `provider`, `result_fetch`, `raw_persist`, `normalization`, `analysis` 실패를 구분한다. Provider 수집은 성공했지만 정규화가 실패한 경우 작업은 최종 성공으로 보지 않고 AI 답변 상태를 `unknown`, 언급·인용을 `not_evaluated`로 둔다. 원본이 있으면 새 외부 task를 제출하지 않고 정규화 단계부터 재처리한다.

### 3.5 GSC와 자사 크롤은 유지한다

DataForSEO의 검색량·순위·SERP 데이터는 고객 사이트의 실제 클릭·노출·CTR을 대체하지 못한다. GSC는 유지한다. 사이트맵·robots.txt·구조화 데이터·콘텐츠 렌더링 진단도 고객이 등록하고 분석을 허용한 자사 사이트 범위에서 유지한다. 두 데이터는 외부 검색 서비스 화면을 자동화하는 관측과 성격이 다르다.

### 3.6 Provider 교체 가능성을 확보한다

화면과 도메인 로직이 DataForSEO 응답 타입을 직접 사용하지 않게 한다. Provider 책임은 다음 네 영역으로 나눈다.

1. **제출**: 요청 검증, 지원 기능 확인, 동기·비동기 방식 선택, 외부 task 생성.
2. **상태·결과 조회**: callback 수신, Tasks Ready·Task GET 조회, Live 결과 수신.
3. **정규화**: Provider 원본을 공통 answer·reference·SERP item 모델로 변환.
4. **재시도·오류 처리**: 재조회와 재제출 구분, rate limit·잔액·지원 불가·파싱 오류 분류.

```ts
interface SearchIntelligenceProvider {
  capabilities(): ProviderCapabilities;
  submit(request: ProviderRequest): Promise<SubmitResult>;
  getStatus?(taskId: string): Promise<ProviderTaskStatus>;
  getResult?(taskId: string): Promise<ProviderRawResult>;
  executeLive?(request: ProviderRequest): Promise<ProviderRawResult>;
  normalize(raw: ProviderRawResult): Promise<NormalizedObservation>;
  classifyError(error: unknown): ProviderError;
}
```

제품별 adapter는 capability로 `async_task`, `callback`, `tasks_ready`, `live`, `html`, `screenshot` 지원 여부를 선언한다. 모든 DataForSEO 제품군이 SERP Standard Task와 같은 제출·callback 흐름을 지원한다고 가정하지 않는다. Labs·Keywords·Backlinks처럼 동기 또는 제품별 계약이 다른 API는 같은 도메인 결과를 만들더라도 실행 adapter를 분리한다.

V2에서는 DataForSEO adapter를 구현한다. 향후 다른 계약형 Provider가 필요해져도 같은 정규화 계층을 사용할 수 있게 한다. 기존 브라우저 Collector는 병행 검증 중 비교 원천으로만 사용하고, 전환 게이트를 통과한 뒤 운영 구현에서 제거한다.

### 3.7 원본, 정규화, 분석을 분리한다

Provider 원본 JSON·HTML·Screenshot 참조는 변경 없이 보존하고, 다음 결과를 별도 버전으로 만든다.

- AI 답변 본문과 answer block
- AI 답변 생성 여부
- 자사·경쟁사별 브랜드 언급과 근거 구간
- 자사 URL·경쟁 URL·기타 출처의 인용
- 일반 SERP item과 순위

DataForSEO 응답의 `references`, `items[].references`, 답변 Markdown 링크가 같은 URL을 가리킬 수 있다. URL은 원문을 보존한 채 canonical key를 별도로 계산해 중복을 정리한다. fragment, 기본 port, host 대소문자, 추적 parameter 정책을 명시하며, redirect 추적 여부는 후속 데이터 계약에서 정한다. 중복 URL을 하나의 출처로 합쳐도 다음 정보는 잃지 않는다.

- Provider 원본 배열과 field path
- 원래 reference index와 표시 순서
- 답변 block·문장과의 연결
- 처음 등장한 위치와 반복 등장 위치
- 원본 URL·제목·도메인

정규화 결과에는 `collection_method`, `collection_method_version`, `provider_schema_version`, `normalizer_version`, `analysis_version`을 남긴다. 기존 Collector 데이터와 DataForSEO 데이터는 같은 차트에 표시할 수 있지만 전환 시점과 수집 방식 변경을 명시하고, 두 방식의 차이를 실제 성과 변화로 해석하지 않는다.

### 3.8 지표의 분모를 고정한다

| 지표 | 분자 | 분모 | 제외 |
| --- | --- | --- | --- |
| AIO·AI 답변 생성률 | `answer_state=present` | 해당 표면을 정상 평가한 `task_state=succeeded` 관측 | failed, deferred, answer unknown |
| 브랜드 언급률 | `mention_state=mentioned` | 답변이 존재하고 언급 평가가 끝난 관측 | answer absent, not_evaluated |
| 자사 인용률 | `citation_state=cited` | 답변이 존재하고 인용 평가가 끝난 관측 | answer absent, not_evaluated |
| 프롬프트 기준 인용 커버리지 | 자사 인용이 확인된 프롬프트 | AI 답변 상태까지 정상 평가된 전체 프롬프트 | failed, deferred, unknown |

각 지표는 분자·분모 건수, 제외 건수와 제외 사유를 함께 제공한다. `AI 답변 미생성`, `답변은 있으나 브랜드 미언급`, `Provider 실패`를 같은 0으로 합산하지 않는다.

### 3.9 하위 호환성과 데이터 보존

기존 테이블과 화면 계약은 가능한 한 adapter와 호환 view 계층으로 유지한다. 신규 상태 축이 추가돼도 기존 성공·실패 표시는 파생값으로 제공하며, 기존 API 응답을 한 번에 제거하지 않는다. 기존 수집 원본, 분석, 보고서 snapshot과 변경 이력은 보존하고 신규 Provider 데이터가 과거 레코드를 덮어쓰지 않게 한다. 확정 보고서는 생성 당시의 원본 참조, 정규화·분석 버전, 지표 분모를 고정해 이후 재처리나 Provider 정정으로 바뀌지 않게 한다.

## 4. 메뉴별 영향 분석

### 4.1 개요

| 구분 | 내용 |
| --- | --- |
| 개선 | AIO·AI Mode 수집 성공률과 정기성이 높아지고, 위치·언어·기기별 가시성 비교가 가능해진다. 검색량·키워드 난이도·SERP 노출을 결합해 최신 기회의 우선순위를 계산할 수 있다. |
| 유지 | GSC 연결 체크, 사이트맵 기반 콘텐츠 가시성, 조직·브랜드 필터, 체크리스트, 리포트 진입 흐름은 유지한다. |
| 퇴보 위험 | 로컬 Chrome에서 사용자가 직접 본 화면과 완전히 같은 결과라는 설명은 할 수 없다. Provider 장애와 비용 제한 때문에 일시적으로 데이터가 지연될 수 있다. |
| V2 방향 | `AI 가시성`, `검색 수요`, `콘텐츠 준비도`, `실제 검색 성과` 네 축으로 개요를 재구성한다. 샘플 데이터 fallback은 Demo 브랜드로 제한한다. |

### 4.2 AI 가시성 > 가시성 개요

| 구분 | 내용 |
| --- | --- |
| 개선 | AIO·AI Mode·일반 SERP를 동일 위치·언어·기기 조건으로 비교할 수 있다. AIO의 절대 위치, 인용 URL, 일반 organic 순위, PAA와 영상 블록을 함께 분석할 수 있다. DataForSEO AI Optimization의 시장 mentions·AI search volume을 별도 시장 지표로 추가할 수 있다. |
| 유지 | 기존 `prompt_runs → 분석 → 브랜드 언급·감성·인용` 흐름과 모델·마켓 필터는 유지한다. |
| 퇴보 위험 | DataForSEO 집계 지표와 요청형 추적 프롬프트 지표의 분모가 다르다. 하나의 가시성 점수로 섞으면 설명 가능성이 낮아진다. |
| V2 방향 | `추적 프롬프트 실측`과 `시장 가시성 추정`을 분리하고, 두 지표가 같은 방향일 때만 강한 인사이트로 표시한다. |

### 4.3 AI 가시성 > 프롬프트 리서치

| 구분 | 내용 |
| --- | --- |
| 개선 | 관련 키워드, 키워드 아이디어, PAA, 관련 검색, 검색량, 난이도, 검색 의도, SERP feature, Google Trends를 사용해 현재 LLM 브레인스토밍 위주의 추천을 검증할 수 있다. AI Keyword Data가 지원하는 시장에서는 AI 도구 내 수요도 별도 신호로 사용할 수 있다. |
| 유지 | 사용자가 토픽을 입력하고 후보 질문을 검토한 뒤 라이브러리에 등록하는 흐름은 유지한다. |
| 퇴보 위험 | API가 반환하는 검색 키워드는 실제 자연어 프롬프트보다 짧고 SEO 중심일 수 있다. 한국어 AI 검색 수요 데이터의 범위가 제한될 수 있다. |
| V2 방향 | SEO 키워드를 그대로 프롬프트로 쓰지 않고 `검색 수요 키워드 → 사용자 과업 → 자연어 프롬프트 묶음`으로 확장하는 Neodio 변환 계층을 둔다. |

### 4.4 AI 가시성 > 검색어 트렌드

| 구분 | 내용 |
| --- | --- |
| 개선 | 자체 수집 로그 기반 추정치를 Google Trends·검색량 데이터로 교체할 수 있다. 지역별·기간별 상대 관심도와 관련 토픽·쿼리를 제공할 수 있다. |
| 유지 | 프롬프트 언급 추세와 검색 수요 추세를 교차 비교하는 화면 목적은 유지한다. |
| 퇴보 위험 | Google Trends는 상대 지수이며 절대 검색량과 다르다. 네이버 데이터랩을 대체하지 못하므로 한국 시장의 네이버 수요가 빠질 수 있다. |
| V2 방향 | Google Trends, Google 검색량, GSC 실측, Neodio AI 언급 추이를 네 개의 명시적 시계열로 분리한다. 네이버 데이터랩은 별도 연동 과제로 유지한다. |

### 4.5 AI 가시성 > 검색 성과(GSC)

| 구분 | 내용 |
| --- | --- |
| 개선 | GSC 쿼리에 DataForSEO 검색량·난이도·SERP feature·경쟁 도메인·현재 organic 순위를 붙여 우선순위를 높일 수 있다. |
| 유지 | 고객 사이트의 클릭, 노출, CTR, 평균 순위와 OAuth 연결은 GSC를 계속 사용한다. |
| 퇴보 위험 | DataForSEO 지표로 GSC 수치를 대체하면 고객 실측 성과를 잃는다. |
| V2 방향 | GSC를 성과의 기준으로 유지하고 DataForSEO는 시장 맥락과 경쟁 정보를 보강한다. |

### 4.6 AI 가시성 > YouTube AIO 인용

| 구분 | 내용 |
| --- | --- |
| 개선 | AIO의 영상·링크 요소와 YouTube 검색 결과, 영상 정보·자막·댓글을 함께 사용할 수 있다. 자사 영상과 경쟁 영상이 AIO와 YouTube 검색에서 각각 어떤 위치에 있는지 비교할 수 있다. |
| 유지 | 프롬프트별 AIO 존재 여부, 자사 영상 인용 여부, 인용 순서, 수집일 추적은 유지한다. |
| 퇴보 위험 | 현재 DOM 수집이 얻는 YouTube 시작 시각이나 문단과 영상의 세밀한 연결이 DataForSEO 응답에서 항상 제공되는지는 검증이 필요하다. |
| V2 방향 | PoC에서 `영상 URL·채널·시작 구간·문단 연결` 필드 충족률을 측정한다. 빠진 필드는 고객 소유 YouTube 공식 콘솔 연동 또는 제공 가능한 범위로 화면 계약을 조정한다. 브라우저 Collector로 보완하지 않는다. |

### 4.7 AI 가시성 > YouTube 관리

| 구분 | 내용 |
| --- | --- |
| 개선 | YouTube 검색 순위, 영상 정보, 자막, 댓글을 이용해 영상별 주제 적합성·검색 노출·AIO 인용 가능성을 진단할 수 있다. |
| 유지 | 브랜드 채널 등록, 추적 영상 선택, 예상 프롬프트, 작업 로그는 Neodio 고유 기능으로 유지한다. |
| 퇴보 위험 | 채널 소유자만 알 수 있는 YouTube Studio 성과 데이터는 제공되지 않는다. |
| V2 방향 | 외부 노출과 인용은 DataForSEO, 내부 최적화 작업과 향후 소유 채널 성과는 Neodio·YouTube 공식 연동으로 분리한다. |

### 4.8 AI 가시성 > 수집 로그

| 구분 | 내용 |
| --- | --- |
| 개선 | 브라우저 프로세스 대신 Provider task 상태를 추적하므로 새벽 정기 수집과 대량 작업이 안정된다. postback·pingback 또는 Tasks Ready 방식으로 비동기 완료 처리가 가능하다. |
| 유지 | 프롬프트별 성공·실패, 원문, 출처, 분석, 재시도 이력은 유지한다. |
| 퇴보 위험 | 로컬에서 열린 실제 Chrome 화면과 스크린샷이 기본 증거가 아니게 된다. Provider 작업 지연과 과금 실패라는 새로운 오류가 생긴다. |
| V2 방향 | `queued → submitting → running → succeeded/failed/deferred` 작업 상태와 AI 답변·언급·인용 상태를 분리해 표시한다. `submission_unknown`, callback·Recovery 이력, 비용과 Provider task ID는 운영자 상세에서 제공한다. HTML·Screenshot은 감사 표본에 사용한다. |

### 4.9 프롬프트 관리 > 프롬프트 전략

| 구분 | 내용 |
| --- | --- |
| 개선 | 검색량, 난이도, 추세, PAA, 관련 키워드, 경쟁 도메인, AIO 존재율, AI mentions를 결합해 추천 근거를 수치화할 수 있다. GSC 노출은 높지만 AIO 인용이 없는 쿼리 같은 교차 기회를 찾을 수 있다. |
| 유지 | 추천을 사람이 검토한 후 추적 프롬프트로 등록하는 흐름은 유지한다. |
| 퇴보 위험 | 공급자 지표를 그대로 점수화하면 일반 SEO 난이도가 GEO 가치보다 과대 반영될 수 있다. |
| V2 방향 | `기회 점수 = 시장 수요 × AI 노출 격차 × 사업 적합도 × 콘텐츠 실행 가능성` 구조를 채택하고 각 항목을 설명 가능하게 표시한다. |

### 4.10 프롬프트 관리 > 프롬프트 라이브러리

| 구분 | 내용 |
| --- | --- |
| 개선 | 프롬프트별 예상 비용, 수집 주기, 위치·언어·기기, AIO·AI Mode·일반 SERP 표면을 설정할 수 있다. 유사 키워드와 중복 프롬프트를 API 데이터로 정리할 수 있다. |
| 유지 | CRUD, 카테고리·토픽, 추적 상태, CSV, 변경 이력은 유지한다. |
| 퇴보 위험 | 시장·언어·기기 조건이 크게 늘어나면 저렴한 단가라도 곱연산으로 비용이 증가한다. |
| V2 방향 | 기본 주 1회 전체 수집을 적용한다. 중요도는 비용 절감보다는 수동 즉시 재수집과 향후 고빈도 수집 대상 선정에 사용한다. |

### 4.11 브랜드 관리 > 브랜드 가시성

| 구분 | 내용 |
| --- | --- |
| 개선 | 경쟁 브랜드의 AIO·AI Mode·organic 노출, 인용 도메인, 외부 웹 감성, 시장 mentions를 확장할 수 있다. 현재 등록한 경쟁사만 보는 한계를 줄일 수 있다. |
| 유지 | 별칭, 오탐 제외, 브랜드 역할, 감성 근거, 모델·토픽별 비교는 유지한다. |
| 퇴보 위험 | Content Analysis의 웹 감성과 AI 답변 감성은 서로 다른 모집단이다. AI Optimization의 집계 mention과 요청형 추적 프롬프트 mention도 직접 합산하면 안 된다. |
| V2 방향 | `AI 답변`, `일반 웹`, `검색 결과`의 브랜드 신호를 분리한 뒤 종합 인사이트에서만 함께 해석한다. |

### 4.12 브랜드 관리 > 리포트

| 구분 | 내용 |
| --- | --- |
| 개선 | 검색 수요, SERP, AIO, AI Mode, GSC, 사이트 진단을 한 스냅샷에 담아 고객 설명력이 높아진다. 경쟁사와의 격차도 정량화할 수 있다. |
| 유지 | 보고서 snapshot, draft/final, 섹션 선택, 과거 보고서 불변성은 유지한다. |
| 퇴보 위험 | Provider가 과거 데이터를 수정해도 확정 보고서가 바뀌면 안 된다. 데이터 출처가 많아질수록 숫자의 기준일과 분모 설명이 복잡해진다. |
| V2 방향 | 보고서마다 출처, 관측 기간, 지역, 언어, 기기, 표본 수, Provider 수집 시각을 함께 고정한다. |

### 4.13 도메인 > URL 인스펙터

| 구분 | 내용 |
| --- | --- |
| 개선 | URL별 AIO 인용, organic 순위, SERP feature, 백링크, referring domain, 신규·소실 링크를 결합할 수 있다. `인용은 없지만 organic 권위가 높은 페이지`, `AIO에 인용되지만 자사 페이지보다 약한 경쟁 페이지`를 찾을 수 있다. |
| 유지 | 사이트맵 URL, 등록 URL, GSC URL 검사, 자사 크롤 기반 콘텐츠 특성은 유지한다. |
| 퇴보 위험 | DataForSEO의 외부 크롤 상태는 Google 색인 상태나 고객 사이트의 실제 GSC 판정을 대체하지 않는다. |
| V2 방향 | URL별로 `Google 실측`, `시장 SERP`, `AI 인용`, `콘텐츠 준비도`, `링크 권위`를 구분해 보여준다. |

### 4.14 기회 > 개요 및 상세

| 기회 유형 | DataForSEO 효과 | 유지할 Neodio 기능 | 퇴보 위험·주의 |
| --- | --- | --- | --- |
| 토픽 기회 | 검색량·난이도·PAA·관련 검색·AIO 존재·경쟁사 노출로 우선순위 향상 | 추적 프롬프트 전환, Visibility Funnel | API 키워드가 실제 구매자 질문과 다를 수 있음 |
| 소스 기회 | AIO·AI Mode 상위 인용 도메인과 백링크로 접촉·콘텐츠 후보 발굴 | 자사/경쟁 출처 분류, 추천 검토 | 많이 인용된 도메인이 고객에게 실행 가능한 매체라는 보장은 없음 |
| 콘텐츠 복구 | SERP에서 이미 노출되나 AI 인용이 없는 페이지 식별 | 렌더링·본문 비교와 재크롤 | 외부 API만으로 JS 가독성 원인을 판정할 수 없음 |
| 복잡도·FAQ·목차·멀티미디어 | PAA, AI 답변 형식, 경쟁 페이지 구조를 근거로 추천 강화 | 자사 페이지 크롤과 수정 가이드 | 추천을 일반 SEO 템플릿으로 단순화할 위험 |
| robots.txt | 영향 거의 없음 | 직접 fetch와 AI crawler 규칙 진단 | DataForSEO 전환 대상 아님 |
| 구조화 데이터 | SERP feature 출현 여부와 경쟁 페이지 비교 가능 | 자사 JSON-LD 크롤·검증 | SERP feature 부재가 구조화 데이터 오류를 직접 의미하지 않음 |
| YouTube 기회 | YouTube 검색·AIO 영상 인용·자막·댓글로 주제 공백 분석 | 영상별 작업 로그와 재검증 | 소유 채널의 내부 성과는 별도 공식 연동 필요 |

### 4.15 설정 > 조직 관리

DataForSEO 전환에 따른 사용자 기능 변화는 없다. 조직별 API 비용, 예산, 기본 위치·언어·기기 정책을 추가할 수 있다. 조직 데이터 격리와 owner 권한은 유지한다.

### 4.16 설정 > 브랜드 설정·상세·연결 관리

브랜드 도메인, 별칭, 경쟁 브랜드, 시장, YouTube 채널 설정은 유지한다. V2에서는 다음을 추가한다.

- 기본 DataForSEO 위치·언어·기기
- 추적 시장별 수집 정책
- 월간 예산과 경고선
- DataForSEO 연결 상태와 잔액·최근 오류
- Provider 장애 시 연기·재시도 정책과 향후 보조 계약형 Provider 사용 여부
- GSC와 DataForSEO의 역할 설명

### 4.17 설정 > 변경 이력·유저 관리

현재 기능을 유지한다. 비용과 데이터에 영향을 주는 다음 변경을 감사 로그에 추가한다.

- 수집 주기 변경
- 위치·언어·기기 추가
- 프롬프트 중요도 변경
- API 예산 변경
- Provider 변경과 수동 재수집

### 4.18 도움말 및 학습

현재 도움말 구조를 유지하되 다음 개념을 새로 설명한다.

- 추적 프롬프트 실측과 시장 추정의 차이
- AIO 미노출, 미측정, Provider 실패의 차이
- 검색량과 Google Trends 상대 지수의 차이
- GSC 평균 순위와 DataForSEO SERP 순위의 차이
- Provider 결과가 개인화 검색 결과와 다른 이유
- 주 1회 전체 수집과 추가 즉시 수집의 차이

## 5. 전환으로 개선되는 영역

### 5.1 운영 안정성

- 사용자 PC와 Chrome 설치·자동 시작 의존을 제거한다.
- CAPTCHA 수동 해결을 Google 수집 운영에서 제거한다.
- Standard task와 postback을 이용해 새벽 대량 수집을 운영할 수 있다.
- 위치·언어·기기 조건을 요청 단위로 재현할 수 있다.
- Provider task ID를 기준으로 재시도와 비용을 추적할 수 있다.

### 5.2 데이터 범위

- AI 답변뿐 아니라 organic, PAA, 관련 검색, 영상, 쇼핑 등 같은 SERP의 주변 맥락을 얻는다.
- 검색량·난이도·트렌드가 프롬프트 리서치와 전략에 추가된다.
- 경쟁사 도메인, 인용 출처, 백링크를 함께 분석할 수 있다.
- YouTube 검색과 영상 본문 신호를 AIO 인용과 연결할 수 있다.

### 5.3 제품 완성도

- 현재 mock 또는 자체 추정인 검색 트렌드와 일부 전략 지표를 실데이터로 전환할 수 있다.
- `왜 이 프롬프트를 추적해야 하는가`와 `어떤 URL을 먼저 개선해야 하는가`에 정량 근거를 제공할 수 있다.
- 보고서가 단순 언급률 집계에서 시장 수요와 실행 계획을 포함하는 형태로 발전한다.

## 6. 전환으로 퇴보하거나 새로 생기는 위험

### 6.1 관측의 성격 변화

- 사용자 PC의 실제 Chrome·IP에서 본 결과가 아니라 DataForSEO가 지정 위치를 모사한 비개인화 결과가 된다.
- 개인 검색 기록, 로그인 상태, 고객 사무실 네트워크 특성은 반영되지 않는다.
- 화면 DOM을 직접 통제하지 않아 Provider 파싱 누락을 즉시 수정할 수 없다.

### 6.2 외부 의존성과 비용

- Provider 장애, 지연, 계정 잔액, 가격 변경이 수집 SLA에 영향을 준다.
- AIO 비동기 로딩, 높은 depth, screenshot·HTML 등 유료 옵션이 비용을 높인다.
- 프롬프트 × 시장 × 언어 × 기기 × 표면이 늘어나면 낮은 단가도 큰 총액이 되며, 불명확한 제출을 즉시 재시도하면 중복 과금될 수 있다.
- DataForSEO 표준 약관은 가공 분석의 고객 제공과 raw 데이터 재배포를 다르게 취급하므로 고객 노출·내보내기 범위를 계약 검토해야 한다.

### 6.3 데이터 비교 위험

- 전환 전 로컬 수집과 전환 후 Provider 수집을 하나의 연속 시계열로 보면 수집 방법 변화가 성과 변화로 오인될 수 있다.
- 요청형 프롬프트 관측과 DataForSEO 집계 데이터의 표본·분모가 다르다.
- 한국어·한국 위치에서 일부 AI Optimization 제품의 지원 범위가 제한될 수 있다.

### 6.4 기능 세부 손실 가능성

- AIO 문단과 인용의 세밀한 연결
- YouTube 인용 시작 구간
- 실제 화면과 동일한 screenshot
- Google이 답변을 생성하는 동안의 중간 상태

PoC에서 필드 충족률을 측정한다. 핵심 필드가 부족하면 화면 계약을 조정하거나 다른 계약형 API를 검토하며, 기존 브라우저 Collector를 장기 운영 해법으로 사용하지 않는다.

## 7. 유지되는 핵심 기능

- 조직·브랜드 테넌시와 역할 기반 권한
- 프롬프트 라이브러리와 카테고리·토픽 관리
- 브랜드 별칭과 경쟁사 관리
- 보고서 snapshot과 확정본 불변성
- GSC OAuth와 실제 클릭·노출·CTR
- 사이트맵 크롤과 콘텐츠 진단
- robots.txt·구조화 데이터·FAQ·목차·복잡도 기회
- 변경 이력과 감사 로그
- 사용자 관리
- 한국어 브랜드 별칭·조사 결합형·국내 도메인 분류 등 한국 시장 특화 분석
- Demo 브랜드의 샘플 데이터

## 8. 경쟁 솔루션 대비 차별화 방향

### 8.1 한국 시장 이중 관측

Google AIO·AI Mode와 DataForSEO가 제공하는 네이버 일반 SERP를 함께 분석한다. 네이버 통합검색 AI 브리핑은 확정 기능이 아닌 후속 검증 후보다. DataForSEO Naver HTML에 본문과 출처가 안정적으로 포함되고 PoC 기준을 통과하는 경우에만 기존 `parse_naver_ai_html.py`의 파싱 규칙을 Provider normalizer로 옮긴다. 이 방식은 Neodio가 Naver 화면을 직접 요청하지 않고 DataForSEO 원본을 처리하므로 전체 전환 원칙과 양립한다. 글로벌 솔루션이 약한 한국어 브랜드 별칭, 조사 결합형, 국내 매체·커뮤니티·검색 생태계를 별도 정규화한다.

DataForSEO의 `SERP API AI Summary`는 Naver가 사용자에게 노출한 AI 브리핑이 아니라 검색 결과를 DataForSEO가 다시 요약한 생성 결과다. 이 값은 Naver AI 노출 지표로 사용하지 않는다. 별도 Naver AI 검색 탭까지 HTML에 포함되는지는 통합검색 AI 브리핑과 구분해 PoC한다.

### 8.2 측정에서 실행까지 이어지는 Citation Operations

단순 대시보드에 머물지 않고 다음 연결을 제공한다.

```text
인용되지 않는 프롬프트
→ 경쟁 인용 URL
→ 자사 대체 URL
→ 콘텐츠 구조·가독성 진단
→ 수정 작업과 담당자 기록
→ 재수집
→ AIO 인용 및 GSC 성과 비교
```

### 8.3 수요와 AI 노출을 결합한 우선순위

검색량이 큰 키워드만 추천하거나 AI 언급이 낮은 질문만 추천하지 않는다. 시장 수요, AI 노출 격차, 고객 사업 적합도, 콘텐츠 실행 가능성, GSC 실적을 결합해 이유가 보이는 기회 점수를 제공한다.

### 8.4 근거 추적성과 재현성

모든 카드와 추천에서 다음 근거로 내려갈 수 있게 한다.

- 원 프롬프트
- 수집 위치·언어·기기·시각
- 원 답변과 인용
- Provider 원본 task
- 분석 버전
- 설정 버전과 브랜드 별칭
- 추천을 만든 규칙

### 8.5 미측정과 실패를 숨기지 않는 품질 모델

`0`을 미노출로 단정하지 않는다. 미측정, 정상 미노출, Provider 실패, 파서 실패, 예산 연기를 구분하고 대시보드에 데이터 완전성과 신뢰도를 함께 표시한다.

### 8.6 YouTube AIO 특화 운영

YouTube 영상이 AIO에서 어느 질문에 인용되는지뿐 아니라 YouTube 검색 순위, 영상 주제·자막, 경쟁 영상, 실제 최적화 작업과 전후 변화를 하나로 연결한다.

### 8.7 고객 보고와 운영 거버넌스

조직·브랜드 권한, 변경 이력, 확정 보고서, 설정 버전을 갖춘 운영형 제품으로 차별화한다. 단순 rank tracker보다 에이전시·B2B 조직의 검토와 보고 흐름에 적합하게 만든다.

## 9. 목표 데이터 아키텍처

```text
DataForSEO Scheduler
  ├─ SERP Organic + AIO
  ├─ Google AI Mode
  ├─ Keyword / Trends
  ├─ YouTube
  ├─ Backlinks
  └─ AI Optimization
          ↓
Provider Task Store
  ├─ 요청 조건
  ├─ 비용
  ├─ 상태
  └─ raw JSON / HTML / screenshot ref
          ↓
Normalization Layer
  ├─ prompt run
  ├─ answer block
  ├─ citation
  ├─ SERP item
  ├─ keyword metric
  ├─ video result
  └─ backlink signal
          ↓
Neodio Analysis
  ├─ brand mention
  ├─ sentiment
  ├─ visibility
  ├─ opportunity
  └─ report snapshot
```

기존 `prompt_runs`, `run_analyses`, `brand_observations`, `citations`는 재사용 가능하지만 SERP 전체 구조, Provider task, 비용, 키워드 지표, answer block과 reference mapping을 위한 테이블은 후속 설계가 필요하다.

### 9.1 실행 인프라

V2 초기 규모에서는 별도 상시 백엔드 서버를 두지 않는다. 기존 Next.js BFF와 Vercel Functions, Vercel Cron, Postgres로 예약 수집을 운영한다.

```text
Vercel Cron (주 1회, UTC 기준)
  → 수집 대상·주차 기준 내부 Job 생성(queued)
  → 제출 attempt와 outbound payload를 먼저 기록
  → submitting으로 전환하고 내부 Job ID를 Provider tag에 포함
  → DataForSEO Standard task를 제품별 한도에 맞춰 제출
  → Provider task ID와 응답·cost를 저장
  → 즉시 응답

DataForSEO 완료 알림
  → Vercel callback route
  → callback 인증과 task ID·tag 대조
  → callback receipt에 완료 신호를 멱등 저장
  → 무거운 조회·정규화·분석 없이 신속히 2xx 응답

Vercel 보정 Cron
  → 완료 receipt가 있는 작업과 running·submission_unknown 작업 조회
  → Task GET·Tasks Ready로 결과 회수
  → 원본 저장 후 정규화·분석을 작은 batch로 실행
  → 콜백 유실·타임아웃·불명확한 제출 결과 복구
  → 실패·비용·지연 알림
```

Cron 함수가 DataForSEO 완료를 기다리며 장시간 실행되지 않게 한다. 실행 상태와 retry count는 함수 메모리가 아니라 Postgres에 저장한다. `조직 + 프롬프트 + 시장 + 언어 + 기기 + 표면 + 수집 주차` 유일 키는 내부 Job과 결과의 중복 적재를 막지만, 외부 API가 이미 task를 생성한 뒤 응답이나 DB 저장이 실패한 경우의 중복 과금까지 막아주지는 않는다.

외부 API 호출은 DB transaction에 포함할 수 없으므로 제출 경계를 다음처럼 다룬다.

1. 내부 Job과 제출 attempt ID, 요청 payload hash를 DB에 먼저 기록한다.
2. 작업을 `submitting`으로 바꾸고 안정적인 내부 Job ID·attempt ID를 Provider `tag`에 넣어 제출한다.
3. 정상 응답이면 Provider task ID, 응답 원본, `cost`를 기록하고 `running`으로 전환한다.
4. timeout·connection reset 또는 응답 저장 실패로 결과가 불명확하면 `submission_unknown`으로 둔다. 즉시 재제출하지 않는다.
5. Recovery Cron은 Tasks Ready·완료 결과의 `tag`와 task ID를 내부 Job에 연결한다. Provider에서 기존 제출을 찾을 수 있는 최대 대기 구간과 task SLA가 지나기 전에는 같은 논리 작업을 다시 제출하지 않는다.
6. 끝내 확인할 수 없을 때만 운영 정책에 따라 수동 확인 또는 새 attempt로 재제출하고, 중복 과금 가능성을 비용 원장에 표시한다.

DataForSEO가 요청 idempotency key를 보장한다고 확인되기 전에는 완전한 외부 중복 방지를 약속하지 않는다. 대신 `선기록 → tag 연결 → 불명확 상태 대기·대사 → 제한된 재제출`로 위험을 최소화하고, DataForSEO 계정의 반복 task 제한 기능도 보조 안전장치로 검토한다.

Callback은 Provider가 지원하는 인증·서명 방식을 우선한다. 서명이 없으면 고엔트로피 callback token, 알려진 task ID와 `tag`의 DB 대조, 요청 크기 제한과 rate limit을 결합한다. `provider + task_id + event_type` receipt를 유일 처리 키로 사용해 중복 callback이 분석이나 결과 적재를 반복하지 않게 한다. Callback은 완료 신호만 내구성 있게 저장하고 즉시 응답하며, 결과 회수와 분석은 Recovery Cron 또는 후속 worker가 수행한다.

Recovery Cron은 다음을 복구한다.

- callback이 오지 않았지만 Tasks Ready에 나타난 작업
- callback 처리 중 timeout이 발생했으나 receipt가 저장된 작업
- `submitting` 상태에서 lease가 만료된 작업
- 응답 저장 실패로 `submission_unknown`이 된 작업
- 원본은 저장됐지만 정규화·분석이 끝나지 않은 작업
- rate limit·Provider 일시 장애로 재조회 가능한 작업

재조회와 재제출은 분리한다. 이미 과금된 task의 Task GET 재조회는 우선 허용하고, 새 과금이 발생하는 재제출은 attempt 제한·backoff·예산 검사를 통과해야 한다. Vercel Cron 자체의 실패 재시도에 의존하지 않는다.

별도 worker 또는 큐 도입은 다음 조건이 생겼을 때 검토한다.

- 한 번의 주간 실행에서 제출·정규화할 작업이 Vercel Function 실행 시간 안에 끝나지 않는 경우
- 동시 처리량 제어, 세밀한 지수 backoff 또는 작업별 우선순위가 필요한 경우
- 대규모 HTML·Screenshot 후처리처럼 CPU·메모리 사용량이 커지는 경우
- 콜백 유실 복구와 재처리 SLA가 단순 보정 Cron으로 충족되지 않는 경우

이때도 별도 VM을 우선하지 않고 Vercel Queue·Workflow 또는 관리형 큐를 먼저 검토한다.

보유 중인 일반 랩탑은 운영 스케줄러로 사용하지 않는다. 전원·절전·재부팅·네트워크·공인 HTTPS·비밀값 관리와 장애 감시를 직접 책임져야 하고, DataForSEO 전환 후에는 로컬 브라우저나 고정 실행 장비가 주는 이점이 없기 때문이다. 랩탑은 로컬 개발, PoC, 수동 데이터 검증과 장애 시 일회성 복구 도구 실행에만 사용한다.

### 9.2 Vercel 플랜 판단

현재 사용 중인 Vercel Pro만으로 V2 초기 운영을 시작한다. 별도 상위 플랜이나 유료 add-on은 도입하지 않는다.

- 프로젝트당 Cron 한도에 비해 필요한 작업은 주간 제출, 미완료 보정, 운영 알림 등 소수다.
- DataForSEO Standard task는 비동기로 제출하고 완료 알림을 받으므로 긴 Function 실행 시간이 필요하지 않다.
- 예상 Function 호출량은 `수집 task 수 + 보정 Cron 호출 수` 수준이다. 프롬프트 1,000개를 AIO·AI Mode 두 표면에서 주 1회 수집해 완료 알림을 task별로 받아도 월 약 8,660회에 불과하다.
- Vercel Pro 기본 Observability로 시작하고, 수집 이력·오류·비용은 장기 보존이 가능한 Neodio DB에 저장한다. Observability Plus는 30일 Vercel runtime log 조회가 실제 운영상 필요해질 때만 검토한다.
- Vercel Queue·Workflow는 재시도와 동시성 제어가 DB 기반 보정 Cron으로 감당되지 않을 때만 추가한다.

Enterprise 검토 기준은 일반적인 수집량 증가가 아니라 전용 SLA, SSO·조직 보안 정책, 전용 인프라 또는 지원 계약이 필요한 시점으로 둔다. Pro의 Spend Management에는 예산 알림을 설정하되, 단순 초과 시 전체 프로젝트 자동 중단은 고객 화면까지 정지시킬 수 있으므로 초기에는 알림만 사용한다.

### 9.3 데이터 사용 권한과 보존

DataForSEO의 공개 법률 FAQ는 API 결과를 가공한 분석·보고서·대시보드를 고객에게 제공하는 상업적 사용을 제한하지 않는다고 설명하지만, 원본 또는 거의 가공하지 않은 데이터셋·database dump·raw API를 재판매·재배포할 권리는 표준 약관에 포함되지 않는다고 명시한다. 고객 외부 서비스 출시 전에 최신 약관과 검색 엔진별 원천 약관을 다시 검토하고, 다음 사용 범위를 내부 체크리스트와 계약 검토 기록으로 남긴다.

- 원본 JSON·HTML·Screenshot의 내부 보관 기간과 접근 권한
- 정규화 결과, 집계 지표, 리포트와 고객 대시보드 표시 범위
- CSV·다운로드에서 허용할 파생 데이터와 제외할 raw·near-raw 데이터
- 다수 고객 조직을 한 DataForSEO 계정으로 처리하는 방식
- 개인정보가 포함될 수 있는 SERP 결과의 최소 수집·삭제·접근 통제
- 계약 종료 후 보유 데이터와 재처리 권한
- DataForSEO 약관 변경과 각 검색 엔진 약관 변경의 정기 검토 책임자

계약 검토가 끝나기 전에는 Provider 원본 payload·HTML을 고객에게 직접 다운로드시키거나 Neodio API를 DataForSEO의 대체 raw feed로 제공하지 않는다. 고객 화면은 Neodio가 정규화·분석한 결과와 필요한 출처 링크를 제공한다. 참고 문서는 [DataForSEO 법률 FAQ](https://dataforseo.com/help-center/quick-answers-to-frequently-asked-legal-questions)와 [이용약관](https://dataforseo.com/terms-of-service)이며, 최종 판단은 출시 시점의 계약 문서와 필요 시 서면 확인을 기준으로 한다.

## 10. 단계별 전환

### Phase 0 — 50개 기능 PoC와 계약 확인

- 대표 프롬프트 50개를 브랜드형·비브랜드형·비교형·How-to·구매형으로 구성한다.
- 모바일·데스크톱, 한국 위치·한국어로 AIO와 AI Mode를 요청한다.
- 기존 Chrome Collector와 운영자가 확인한 실제 화면 표본을 비교 기준으로 사용한다. 비교용 신규 브라우저 자동화는 만들지 않는다.
- 답변 존재, 답변 본문, 인용 URL, 인용 순서, YouTube 링크, 시작 구간, HTML·Screenshot 가용성을 측정한다.
- Standard normal/high, Live, 비동기 AIO 옵션별 실제 `cost`와 처리 시간을 측정한다.
- Provider 원본 저장 후 normalizer·analysis version을 고정해 재처리 결과를 비교한다.
- 네이버 통합검색 AI 브리핑이 있는 대표 질의로 Naver HTML의 본문·출처·노출 상태를 확인하고 기존 파서의 재사용률을 측정한다.
- 네이버 통합검색 AI 브리핑과 별도 AI 검색 탭의 지원 여부를 구분한다.
- DataForSEO 결과의 내부 저장, 가공 분석, 고객 대시보드·리포트·내보내기 범위를 계약 관점에서 확인한다.

**정량 통과 게이트의 초기 기준**

- Provider 요청이 접수되고 최종 결과까지 도달한 비율이 98% 이상이다. 실패 1건도 원인이 분류되고 재조회·재제출 여부가 설명돼야 한다.
- 사람이 AI 답변 존재를 확인한 표본에서 본문 추출률이 95% 이상이다.
- URL canonicalization 후 인용 집합의 precision과 recall이 각각 95% 이상이고, 원래 인용 순서 일치율이 90% 이상이다.
- 브랜드 별칭·제외 규칙을 적용한 언급 판별 정확도가 95% 이상이며 false positive를 별도 보고한다.
- 요청한 한국어·한국 위치·기기 조건이 결과 metadata에 100% 남고, 수동 표본에서 조건 오류가 없어야 한다.
- 비동기 AIO 로딩을 포함한 `present / absent / unknown` 판정이 수동 기준과 95% 이상 일치한다.
- 생성된 모든 task에서 실제 `cost` 저장률이 100%이고, 설명되지 않은 중복 과금이 없어야 한다.
- 정상 수신한 원본의 저장률이 100%이며, 같은 원본·같은 normalizer/analysis version 재처리 결과가 100% 재현된다.

이 수치는 PoC 시작 전에 판정표에 고정하는 초기 기준이다. 제품 응답 특성상 조정이 필요하면 결과를 본 뒤 통과시키기 위해 낮추지 않고, 근거와 제품 영향 범위를 기록한 별도 결정으로 변경한다. 네이버 AI 브리핑과 후속 확장 API의 실패는 Google AIO·AI Mode 핵심 전환 통과 여부와 분리한다.

### Phase 1 — P0 Provider 기반과 하위 호환

- capability 기반 Provider abstraction과 Google AIO·AI Mode DataForSEO adapter를 우선 만든다.
- 독립 상태 축, `submitting`·`submission_unknown`, 제출 attempt·tag 연결, callback receipt, Recovery Cron을 구현한다.
- task 제출·완료 수신·원본 저장·정규화·비용 집계를 구현하고 callback에서는 완료 신호만 저장한다.
- 저장 HTML fixture와 소량의 수동 화면 표본으로 정규화 결과를 검증한다.
- 화면은 기존 데이터를 계속 사용하고 내부 DataForSEO 비교 리포트만 만든다.
- 기존 API·DB·화면의 호환 계층을 유지하고 시계열에 `collection_method_version`을 기록한다.
- 기존 수집 이력과 확정 보고서의 불변성을 회귀 검증한다.

### Phase 2 — 500~1,000개 병행 운영 검증

- 500~1,000개 프롬프트를 실제 주간 조건으로 최소 4회 연속 수집한다.
- 기존 Collector와 DataForSEO를 병행하되 고객 지표의 기본 원천은 기존 경로로 유지하고 비교 결과만 내부에 표시한다.
- callback 누락·중복, Vercel timeout, Provider 지연, 잔액 부족, 일시 장애, 응답 저장 실패를 의도적으로 재현한다.
- 실제 task 비용, 처리 시간 p50/p95, 완료율, 미복구 작업, 중복 과금 의심 건을 주차별로 대사한다.
- DataForSEO 원본에서 정규화·분석·기존 화면 호환까지 end-to-end로 검증한다.

**운영 안정성 게이트**

- Recovery 이후 최종 작업 성공률 99% 이상
- 합의한 완료 SLA가 지난 고아 작업 0건
- 설명되지 않은 중복 과금 0건, callback 중복으로 생성된 중복 결과 0건
- 수신 원본 저장률과 재현 가능한 분석률 각각 100%
- 예상 비용과 실제 비용 차이 5% 이내 또는 차이 전부 설명 가능
- 핵심 지표의 Collector 대비 차이가 합의한 허용 범위 안이며 차이 원인이 수집 방식으로 설명 가능
- 기존 화면·API·확정 보고서에 P0 회귀 없음

### Phase 3 — 핵심 기능 점진 전환

전환 우선순위는 다음과 같다.

1. AIO·AI Mode 수집
2. 프롬프트 관리
3. 브랜드 언급
4. 인용 분석
5. 수집 로그
6. 기본 리포트

- 기능 flag로 조직 또는 표면 단위로 DataForSEO를 기본 원천으로 전환한다.
- 정기 수집은 Standard task를 사용하고 수동 즉시 수집의 Live·High priority 사용 기준은 PoC 비용·지연 결과로 정한다.
- 각 기능은 전환 후에도 기존 데이터를 읽고 과거 시계열을 유지한다.
- 핵심 기능이 최소 4회 연속 운영 안정성 게이트를 통과하고 롤백 리허설이 끝난 뒤 Google Collector 실행 경로와 설치 안내를 제거한다.
- Collector 제거 전 마지막 동작 버전과 운영 절차는 감사용으로 보관하되 정기 실행은 중지한다.
- DataForSEO 미지원 표면은 기능별로 보류하거나 별도 계약형 API 과제로 분리한다.

### Phase 4 — 검색 수요와 성과 고도화

1. Labs와 프롬프트 리서치
2. 검색량과 Google Trends
3. GSC 교차 분석
4. 프롬프트 전략과 기회 점수

각 제품군의 호출 방식, 데이터 갱신 주기, 비용과 한국 시장 품질을 별도로 검증한다. 기존 메뉴의 지표를 즉시 교체하지 않고 신규 지표를 병행 표시한 뒤 전환한다.

### Phase 5 — 후속 확장과 운영 최적화

- YouTube 고급 분석
- Backlinks와 Content Analysis
- AI Optimization
- 검증을 통과한 경우에만 네이버 AI 브리핑
- 기본 주 1회 전체 수집과 중요 프롬프트 추가 수집
- 조직별 예산과 비용 예측·실제 task 비용 대사
- Provider 장애 시 지수 재시도 후 수집 연기, 필요하면 별도 계약형 Provider로 전환
- 데이터 품질 대시보드
- normalization 재처리와 schema drift 감지
- 장기 보관·압축 정책

### 10.1 전환·롤백 기준

전환 단위는 전체 시스템이 아니라 `조직 + 표면 + 수집 방식 버전`으로 잡는다. 기능 flag와 adapter version으로 점진 전환하며, 기존 데이터 읽기 경로는 유지한다.

다음 중 하나가 발생하면 해당 단위의 신규 DataForSEO 스케줄을 중지하고 조사한다.

- 운영 안정성 게이트가 2회 연속 미달
- AI 답변·브랜드 언급·인용의 상태 오분류가 고객 지표에 영향을 주는 수준으로 증가
- 원본 손실 또는 확정 보고서 변경 발생
- 설명되지 않은 중복 과금이나 예산 초과 발생
- Provider schema 변화로 핵심 필드 정규화 실패
- 하위 호환성 문제로 기존 화면·API의 핵심 기능이 중단

Collector가 아직 병행 운영 중이면 해당 표면의 기본 경로를 검증된 기존 Collector로 되돌릴 수 있다. Collector 제거 뒤에는 신규 수집을 연기하고 마지막 정상 snapshot을 제공하며, 저장 원본 재처리, 이전 normalizer·adapter version 복원, DataForSEO 재조회 또는 별도 Provider 전환으로 복구한다. 어떤 경우에도 기존 수집 이력이나 확정 보고서를 삭제·재작성하지 않는다.

Collector 제거의 최종 조건은 다음과 같다.

- 50개 기능 PoC와 500~1,000개 운영 검증 통과
- 핵심 기능 최소 4회 연속 안정성 게이트 통과
- 비용 대사와 callback·Recovery 장애 훈련 완료
- 기존 DB·화면·보고서 하위 호환 검증 완료
- 롤백 리허설과 운영 문서 완료

## 11. 후속 기획 문서

이 폴더에 다음 문서를 순차적으로 추가한다.

1. `01-capability-poc.md` — 한국어·한국 시장 PoC 케이스와 판정표
2. `02-data-contract.md` — Provider 요청·응답·정규화 계약
3. `03-menu-spec.md` — 메뉴별 V2 화면과 지표 정의
4. `04-cost-and-scheduling.md` — 과금 모델, 예산, 수집 주기
5. `05-migration.md` — 기존 데이터 호환, 병행 검증 기간, 전환·롤백
6. `06-operations.md` — 상태·재시도·알림·장애·품질 운영
7. `07-data-usage-review.md` — 계약상 저장·가공·고객 제공·내보내기 범위와 검토 기록

## 12. 아직 결정하지 않은 사항

- DataForSEO의 한국어 AIO·AI Mode 실제 필드 충족률
- 50개 기능 PoC와 500~1,000개 운영 검증의 최종 SLA·허용 오차
- callback 서명 지원 여부와 서명이 없을 때 사용할 인증 방식
- `submission_unknown` 상태에서 Provider `tag`로 기존 task를 찾을 수 있는 범위와 최대 대기 시간
- AI Optimization의 한국 시장 활용 가능 범위
- Standard normal/high와 Live의 메뉴별 사용 기준
- 원본 JSON·HTML·Screenshot 보관 기간
- DataForSEO와 검색 엔진 약관상 raw·near-raw 데이터의 고객 표시·내보내기 범위
- 전환 전후 시계열을 한 차트에 보여주는 방식
- Provider 비용을 조직별로 노출할지 운영자만 볼지
- DataForSEO Naver HTML의 AI 브리핑 포함률과 기존 파서 재사용률, 별도 AI 검색 탭의 지원 여부
- 외부 웹 감성과 AI 답변 감성의 종합 점수 제공 여부
- DataForSEO 장애 시 다른 Provider를 자동 사용할지 수집을 연기할지

## 13. 다음 액션

거시 계획 다음 단계는 `01-capability-poc.md`에 50개 판정표와 500~1,000개 운영 검증 시나리오를 작성하고, `02-data-contract.md`에 독립 상태 축·제출 attempt·정규화·지표 분모를 정의하는 것이다. 이어 Sandbox와 소량의 유료 task로 한국어 PoC를 수행한다. PoC가 끝나기 전에는 DB 스키마와 화면 지표를 DataForSEO 응답에 맞춰 확정하지 않는다.
