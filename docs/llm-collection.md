# LLM API 수집

공식 API로 LLM에 질문하고 답변·출처를 `prompt_runs`에 저장한다. Chrome도 사용자 PC도 필요 없어
서버(Vercel 포함)에서 그대로 돌 수 있다. 결과는 네이버/구글 수집과 같은 테이블·화면(수집 로그, 분석)을 쓴다.

## 구조 — `src/lib/backend/llm/`

| 파일 | 역할 |
|---|---|
| `types.ts` | `LlmProvider` 계약: `ask(질문) → { text, citations, model }` |
| `providers/gemini.ts` | Gemini 어댑터 (Interactions API, 웹 검색 근거 `google_search`는 옵션) |
| `registry.ts` | 어댑터 등록부 |
| `runner.ts` | 공통 실행기: 호출·재시도(429/5xx) → `PromptRunSeed` → DB. `resolveApiKey`는 환경변수, 없으면 macOS 키체인 |

**새 LLM 붙이기**: `providers/<이름>.ts`에 `LlmProvider` 구현 → `registry.ts`에 한 줄 →
수집 로그 화면의 `API_ENGINE_LABEL`(CollectionRunsClient.tsx)에 `<이름>-api` 표시 이름 추가.
시드 `llm_models`에 같은 `llmModelId`가 있어야 결과가 그 모델로 집계된다.

## 정기·수동 수집 (CLI)

```bash
npm run collect:llm -- --provider gemini                       # 모든 조직의 추적 프롬프트(오늘 성공분은 건너뜀)
npm run collect:llm -- --provider gemini --query "CRM 추천" --org neodigm --limit 1
npm run collect:llm -- --provider gemini --no-web-search       # 웹 검색 근거 끄기(무료 등급)
```

옵션은 `scripts/collect-llm.ts` 머리 주석. 로컬 DB에 쓰려면 `.env.local`을 불러온 셸에서 실행한다
(`set -a && . ./.env.local && set +a`).

## API 키

- 로컬: `scripts/secret.sh set GEMINI_API_KEY` (클립보드 → 키체인). 환경변수 `GEMINI_API_KEY`가 우선한다.
- 운영(Vercel): 프로젝트 환경변수 `GEMINI_API_KEY`. 없으면 자동 생성 버튼이 안내 문구를 보여 준다.
- 모델: 환경변수 `GEMINI_MODEL`(기본 `gemini-3.5-flash-lite`).

## 웹 검색 근거(출처)와 무료 등급

- 웹 검색 근거를 켜야 `citations`(인용 출처)가 온다. 무료 키에서는 이 기능의 할당량이 0이라 429가 난다 —
  결제를 연결한 프로젝트에서 열린다(2026-09 확인). 끄면 답변 본문만 오므로 **언급률은 재도 인용률은 못 잰다**.
- 웹 검색을 켠 응답의 출처 파싱(`url_citation`)은 모의 응답 테스트만 했고 실제 응답으로는 아직 검증하지 못했다.
- API 답변은 gemini.google.com 앱이나 Google AI Overview와 다르다. AIO 트래커의 대체가 아니라 "Gemini 가시성"이라는 별도 지표다.

## 화면에서 LLM을 부르는 곳 — 원칙: 페이지를 열 때는 부르지 않는다

호출은 사용자가 버튼을 눌렀을 때만 일어나고, 같은 입력의 결과는 저장해 재사용한다. 사용자마다 조직별 분당 호출 수를 제한한다
(`src/lib/backend/llm/rateLimit.ts`, 서버 인스턴스별 메모리 기준의 최소 방어). 모두 웹 검색 없이 모델 지식만 쓰므로 무료 등급으로 동작한다.

| 기능 | 트리거 | 구현 |
|---|---|---|
| **AI로 자동 생성** (브릿지 모달 전반) | 버튼 | `AiGenerateButton` → `POST /api/llm-generate`. 답변 원문을 붙여넣기 칸에 채우고, 저장은 기존 검증(`parse`)과 `/api/llm-bridge`를 거친다 |
| **콘텐츠 수정 가이드**(복잡도·FAQ·목차·멀티미디어·회복) | 버튼 | 같은 엔드포인트에 `sourceUrl`을 주면 서버가 그 페이지 본문(제목·메타·헤딩·본문 8천 자)을 가져와 프롬프트에 붙인다. **조직 브랜드에 등록된 도메인만** 열 수 있고(IP·localhost 거부, 리다이렉트마다 재검사) 실패하면 422로 안내한다(`pageText.ts`) |
| **프롬프트 라이브러리 최적화** | 버튼(모달이 열릴 때) | 라이브러리를 60개씩 나눠 물어 삭제·수정 추천만 받고 검토 화면으로 보낸다. 반영은 사람이 고른 것만 |
| **프롬프트 전략 브레인스토밍** | 버튼 | 3단계 대화를 1단계 프롬프트로 합쳤다. 자동 생성 → "검증 후 저장" |
| **AI로 브랜드 정리** (가시성 개요 "브랜드 최적화" + 브랜드 설정) | 버튼(모달이 열릴 때) | 규칙은 `src/lib/brandOptimization.ts` 한 곳(프롬프트·검증·적용). 응답에서 목록에 없는 이름은 버리고, 바뀌는 게 없는 제안은 거른다. 검토 화면에서 고른 것만 `/api/detected-brand-decisions`(`optimized`)로 반영. "제외"는 이미 경쟁사로 등록된 항목도 목록에서 빼고 제외 결정으로 남긴다 |
| **프롬프트 리서치** (실제 브랜드) | 검색 버튼 | `POST /api/prompt-research` — 관련 토픽·질문·의도 분포를 AI가 제안. 토픽·마켓별로 저장(`bridge_entries`, scope `prompt-research`)해 두고 "다시 생성"(`refresh`)일 때만 새로 호출한다. 브랜드 언급·소스 도메인 집계는 실제 AI 답변이 필요해 이 화면에 없다 |

## 아직 없는 것

- 정기 배치(소스 기회 추천, 브레인스토밍, Gemini 수집): Vercel Cron(`vercel.json`의 `crons` + `CRON_SECRET` 검사)으로 주 1회 실행하는 방식을 계획 중.
  긴 작업은 N건씩 처리하고 진행 위치를 DB에 저장해 다음 실행이 이어받는다.
- 감성 분류의 LLM 전환: 언급된 답변을 10개씩 묶어 한 번에 분류하고, 실패하면 현재의 키워드 분류로 되돌린다.
- 호출 게이트 통합: 지금은 기능마다 캐시·제한을 따로 두고 있다. 캐시(입력 해시)·동시 호출 잠금·일일 예산·사용량 기록을 한 곳으로 모은다.
