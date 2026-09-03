# Neodigm Backend Pipeline Implementation Guide

이 문서는 현재 저장소에서 구현한 백엔드 수집/가공 방향을 재현하기 위한 작업 가이드입니다. 상위 설계는 `neodigm_data_collection_pipeline.md`를 따르고, 이 문서는 실제 코드 위치, 실행 명령, 데이터 계약, 다음 개발 순서를 고정합니다.

## 1. 현재 목표

프론트엔드가 Figma 전체 화면을 mock 데이터로 그릴 수 있도록, mock을 단순 하드코딩이 아니라 실제 운영 구조와 같은 형태로 준비합니다.

흐름은 다음 3단계입니다.

```txt
[1] Collect: 외부 소스 raw 수집
  -> prompt_runs 형태로 저장

[2] Process: raw에서 mention/citation/score 추출
  -> mentions, citations, visibility_scores 생성

[3] Serve: dashboard cache 조회
  -> Overview / Visibility Overview / 기타 화면 API가 읽는 집계 데이터
```

현재 구현은 [1], [2]의 로컬 테스트 버전입니다. 실제 DB가 붙기 전까지 `.tmp` JSON과 `src/lib/db/data/seed.ts`를 사용합니다.

## 2. 주요 파일

| 파일 | 역할 |
| --- | --- |
| `scripts/collect-naver-ai.mjs` | 네이버 AI 브리핑 수집 테스트 CLI |
| `scripts/process-raw.ts` | 수집 raw JSON을 processed JSON으로 변환하는 CLI |
| `src/lib/db/types.ts` | raw/processed/dashboard seed 타입 |
| `src/lib/db/data/seed.ts` | 2달치 Neodigm 기준 raw seed |
| `src/lib/backend/processing/date.ts` | 주간 bucket 유틸 |
| `src/lib/backend/processing/text.ts` | 브랜드/alias mention 탐지, sentiment heuristic |
| `src/lib/backend/processing/mentions.ts` | `prompt_runs.rawResponse` -> `mentions` |
| `src/lib/backend/processing/citations.ts` | `rawMetadata.citations` -> `citations` |
| `src/lib/backend/processing/visibility.ts` | visibility score 계산 |
| `src/lib/backend/processing/index.ts` | processing facade |

## 3. Raw 데이터 계약

모든 LLM/API/브라우저 수집 결과는 먼저 `PromptRunSeed`와 같은 모양으로 저장합니다.

```ts
interface PromptRunSeed {
  id: string;
  promptId: string;
  llmModelId: string;
  marketId: string;
  runAt: string;
  status: "success" | "failed" | "pending" | "paused";
  rawResponse: string;
  rawMetadata: PromptRunMetadata;
}
```

네이버 AI검색 수집 결과 예시는 다음과 같습니다.

```ts
{
  id: "run-naver-ai-...",
  promptId: "prompt-topic-hubspot-onboarding-1",
  llmModelId: "model-naver-ai-search",
  marketId: "market-kr",
  runAt: "2026-09-03T05:31:38.796Z",
  status: "success",
  rawResponse: "AI 브리핑 본문...",
  rawMetadata: {
    source: "naver-ai-search",
    collectedBy: "playwright",
    query: "HubSpot 온보딩 파트너 추천",
    queryUrl: "https://search.naver.com/search.naver?...",
    finalUrl: "https://search.naver.com/search.naver?...",
    answerTextLength: 1320,
    screenshotPath: ".tmp/naver-ai/naver-ai-....png",
    citations: [
      {
        title: "인용 문서 제목",
        url: "https://example.com/page",
        domain: "example.com",
        isOwnDomain: false
      }
    ],
    errorMessage: null
  }
}
```

운영에서도 이 구조를 유지합니다. OpenAI, Gemini, Claude 같은 API 응답도 `rawResponse`에 답변 본문을 저장하고, provider별 원본 필드는 `rawMetadata`에 보존합니다.

## 4. 네이버 AI 브리핑 수집

실행:

```bash
npm run collect:naver-ai -- --query="B2B 통합 마케팅 솔루션 추천"
```

프롬프트/마켓 ID를 지정해서 실행:

```bash
npm run collect:naver-ai -- \
  --query="HubSpot 온보딩 파트너 추천" \
  --prompt-id="prompt-topic-hubspot-onboarding-1" \
  --market-id="market-kr" \
  --timeout-ms=45000
```

결과:

```txt
.tmp/naver-ai/naver-ai-{timestamp}.json
.tmp/naver-ai/naver-ai-{timestamp}.png
```

현재 추출 기준:

- 페이지: `https://search.naver.com/search.naver?ssc=tab.ait.all&ait_pv=answer&query=...`
- AI 브리핑 root: `.fds-aib-expandable-container`
- 본문: root 내부 `fds-markdown-*` leaf node
- citation: root 내부의 외부 링크만 추출
- 일반 통합검색 결과는 제외

참고:

- `ait_pv=answer` URL은 사용자가 네이버 AI 탭에서 질문한 뒤 만들어지는 답변 URL 형식입니다.
- headless 신규 세션에서 이 URL을 바로 열면 네이버가 `잘못된 접근입니다`를 반환할 수 있습니다.
- 이 경우 AI 브리핑 DOM이 렌더링되지 않으므로 collector는 일반 검색 결과를 fallback으로 수집하지 않고 `empty_ai_briefing` 실패로 저장합니다.
- 이전 검색 결과 진입 방식인 `where=nexearch&ssc=tab.ait.all&query=...`는 일부 쿼리에서 검색 결과 상단의 `AI 브리핑` 카드를 수집할 수 있지만, `ait_pv=answer` 대화형 답변 URL과는 다른 진입 경로입니다.

주의:

- 같은 query라도 결과가 항상 같지 않습니다.
- 네이버 DOM/class는 바뀔 수 있습니다.
- 짧은 시간에 많은 요청을 보내면 차단될 수 있습니다.
- 현재 코드는 수집 가능성 검증용입니다. 배치 운영 시 큐, rate limit, backoff가 필요합니다.

권장 rate limit 초안:

```ts
{
  source: "naver-ai-search",
  concurrency: 1,
  minDelayMs: 30_000,
  maxDelayMs: 90_000,
  maxAttempts: 3,
  backoff: ["1h", "6h", "24h"],
  stopBatchWhenFailureRateOver: 0.3
}
```

## 5. Processing 실행

네이버 수집 raw만 처리:

```bash
npm run process:raw
```

네이버 수집 raw와 2달치 seed raw를 함께 처리:

```bash
npm run process:raw -- --include-seed
```

결과:

```txt
.tmp/processed/processed-runs-{timestamp}.json
```

출력 구조:

```ts
interface ProcessedPromptRuns {
  promptRuns: PromptRunSeed[];
  mentions: MentionSeed[];
  citations: CitationSeed[];
  visibilityScores: VisibilityScoreSeed[];
}
```

## 6. Mention 처리 스펙

`src/lib/backend/processing/mentions.ts`에서 처리합니다.

입력:

- `PromptRunSeed.rawResponse`
- `BrandSeed[]`

처리:

- `brand.name`
- `brand.domain`
- `brand.aliases`
- 한국어 조사 suffix 허용: `은`, `는`, `이`, `가`, `을`, `를`, `의`, `과`, `와`, `로`, `으로`

출력:

```ts
interface MentionSeed {
  id: string;
  promptRunId: string;
  brandId: string;
  isPresent: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
}
```

현재 sentiment는 운영 LLM 분석 전 단계의 deterministic heuristic입니다.

- positive terms: 추천, 강점, 지원, 제공, 최적화, 전문, 통합, 자동화 등
- negative terms: 부족, 누락, 문제, 제외, 어렵, 제한, 위험 등

향후 운영에서는 이 부분을 공용 sentiment service 또는 LLM classification으로 교체합니다. 단, 함수 계약은 유지합니다.

## 7. Citation 처리 스펙

`src/lib/backend/processing/citations.ts`에서 처리합니다.

입력:

- `PromptRunSeed.rawMetadata.citations`
- 보조 fallback: `rawResponse` 내부 URL
- `BrandSeed[]`

처리:

- 동일 URL 중복 제거
- domain으로 brand infer
- `neodigm.com`, `*.neodigm.com`은 `isOwnDomain=true`

출력:

```ts
interface CitationSeed {
  id: string;
  promptRunId: string;
  brandId: string | null;
  domain: string;
  pageUrl: string;
  title: string;
  isOwnDomain: boolean;
}
```

## 8. Visibility Score 처리 스펙

`src/lib/backend/processing/visibility.ts`에서 처리합니다.

주간 단위 grouping key:

```txt
weekStart + llmModelId + marketId
```

공식:

```txt
35% Mentions + 15% Citations + 30% Position + 20% Sentiment
```

현재 계산:

- `mentionsScore`: 해당 주/모델/마켓 run 중 own brand가 언급된 비율
- `citationsScore`: 해당 주/모델/마켓 run 중 own domain citation 비율
- `positionScore`: own brand mention position 평균
- `sentimentScore`: own brand sentimentScore 평균

position normalization:

```txt
1위 = 1.00
2위 = 0.75
3위 = 0.55
4위 이하 = 0.35
미노출 = 0
```

## 9. 현재 처리 결과 예시

네이버 수집 raw 4건:

```txt
promptRuns: 4
mentions: 20
ownMentions: 1
citations: 41
ownCitations: 2
visibilityScores: 1
```

2달치 seed raw 포함:

```txt
promptRuns: 900
mentions: 4500
ownMentions: 717
citations: 1534
ownCitations: 599
visibilityScores: 168
```

## 10. 다음 구현 순서

1. `processPromptRuns` 결과를 실제 DB 테이블에 insert하는 adapter 추가
2. Postgres migration 작성
3. `prompt_runs`, `mentions`, `citations`, `visibility_scores` upsert 구현
4. Overview/Visibility Overview가 수동 mock snapshot이 아니라 processed aggregate를 읽도록 전환
5. 네이버 수집기를 queue job으로 감싸기
6. 실패 상태 세분화: `failed`, `blocked_suspected`, `empty_ai_briefing`, `layout_changed`
7. sentiment/brand extraction을 LLM classifier로 교체하되 현재 output contract 유지

## 11. 개발 시 검증 명령

```bash
npm run collect:naver-ai -- --query="B2B 통합 마케팅 솔루션 추천"
npm run process:raw
npm run process:raw -- --include-seed
npx tsc --noEmit
npm run lint
npm run build
```

## 12. 중요한 원칙

- 화면은 raw를 직접 읽지 않습니다.
- raw는 최대한 원문 그대로 보존합니다.
- processor는 같은 raw를 넣으면 같은 processed 결과가 나오도록 deterministic하게 유지합니다.
- provider별 차이는 collector에서 흡수하고, processor 입력은 `PromptRunSeed` 형태로 통일합니다.
- 네이버는 동일 query라도 결과가 달라질 수 있으므로 query 결과를 overwrite하지 않고 매번 새 `prompt_run`으로 저장합니다.
