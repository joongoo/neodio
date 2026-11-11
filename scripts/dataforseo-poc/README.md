# DataForSEO Stage A 독립 PoC 모듈

기존 DB, 화면, Collector와 연결하지 않고 DataForSEO Standard Task 두 건만 수동 실행하는 모듈이다. 자동 실행과 반복 제출 기능은 없다.

## 고정 실행 계획

| 표면 | 방식 | Task 수 | 최대 예상 비용 |
| --- | --- | ---: | ---: |
| Google Organic Advanced + `load_async_ai_overview` | Standard | 1 | USD 0.0012 |
| Google AI Mode Advanced | Standard | 1 | USD 0.0012 |
| 합계 |  | 2 | USD 0.0024 |

공식 단가는 2026-11-11 확인 기준이다. Organic Standard 기본 USD 0.0006에 비동기 AIO 로딩 비용이 최대 1배 추가된다. AIO가 없거나 캐시에서 반환되면 추가 비용이 환급될 수 있다. AI Mode Standard는 USD 0.0012이다.

## UI에서 실행

Stage A 화면은 `/dataforseo-poc`이다. 화면에서 요청 내용 검토를 누르면 비용과 요청 건수를 다시 확인할 수 있고, 이어서 `확인 후 2건 제출`을 눌러야 Provider 요청이 발생한다. 결과가 준비될 때까지 화면이 15초마다 무료 Task GET을 호출한다.

로컬 환경에 다음 환경변수를 설정하고 앱을 실행한다.

```text
DATAFORSEO_STAGE_A_ENABLED=true
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...
```

원본 파일 보존 조건 때문에 Stage A UI 실행은 로컬 환경으로 제한한다. 인증 기능을 사용하는 환경에서는 staff 권한만 화면과 API에 접근할 수 있다.

## CLI에서 계획 확인

인증정보는 환경변수로만 전달한다.

```powershell
$env:DATAFORSEO_LOGIN = "..."
$env:DATAFORSEO_PASSWORD = "..."
node scripts/dataforseo-poc/run.mjs
node scripts/dataforseo-poc/run.mjs --execute --confirm-max-cost=0.0024
```

첫 명령은 비용과 요청 건수만 표시한다. 두 번째 명령만 실제 Task를 제출하므로 UI 검증 중에는 사용하지 않는다. 결과는 `.tmp/dataforseo-stage-a/<run-id>/`에 저장되며 Git에서 제외된다.

각 표면별로 요청 payload, 제출 응답, 최신 원본 결과, 정규화 결과를 저장한다. `summary.json`에는 AI 답변 상태, 본문, 원래 순서가 포함된 인용 URL, Provider Task ID와 실제 제출 비용이 포함된다.

## 공식 근거

- [Google Organic Task POST](https://docs.dataforseo.com/v3/serp/google/organic/task_post/)
- [Google Organic Advanced 결과](https://docs.dataforseo.com/v3/serp/google/organic/task_get/advanced/)
- [Google AI Mode Task POST](https://docs.dataforseo.com/v3/serp/google/ai_mode/task_post/)
- [Google AI Mode Advanced 결과](https://docs.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced/)
- [Google Organic 요금](https://dataforseo.com/pricing/google-serp/google-organic-serp-api)
- [Google AI Mode 요금](https://dataforseo.com/pricing/google-serp/google-ai-mode-serp-api)
