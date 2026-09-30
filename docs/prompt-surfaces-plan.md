# 프롬프트 통합 — 질의는 하나, 플랫폼은 체크박스

> 상태: **1~3단계 완료**(스키마·이관, 쓰기 전환·라이브러리 플랫폼 UI, 읽기 전환·프롬프트별 인용 현황). 4단계는 보류(§4). 선행: [youtube-video-tracking-plan.md](./youtube-video-tracking-plan.md)(영상 단위 추적),
> [youtube-aio-tracker-plan.md](./youtube-aio-tracker-plan.md).

## 1. 왜

프롬프트 라이브러리(`prompts`)와 AIO 키워드(`aio_keywords`)가 따로 있어서 같은 질의를 두 곳에 등록해야 하고, 한 질의의 결과를 한 화면에서 볼 수 없다.
두 저장소가 나뉜 이유는 사용자의 사고방식이 아니라 **플랫폼과 비용**(AIO는 검색 1건이 느리고 캡차 때문에 하루 150~250건이 현실적 상한)이다.
게다가 프롬프트 라이브러리의 "Google AI Overview" 엔진은 실제로는 Google **AI 모드**(`udm=50`)라서 이름이 겹친다.

## 2. 원칙

- **질의(프롬프트)는 `prompts` 한 곳에서만 등록한다.** 검색어형("마케토 도입 비용")이든 질문형이든 텍스트일 뿐이다.
- **플랫폼(surface)은 추적(`prompt_tracking`)마다 켜고 끈다** — `prompt_tracking_surfaces`.
  `google-aio`(Google 검색 AI Overview) · `google-ai-mode`(Google AI 모드) · `naver-ai`(네이버 AI 브리핑). 정의는 [promptSurfaces.ts](../src/lib/promptSurfaces.ts).
- **결과 테이블은 플랫폼 성격별로 유지한다.** AIO 관측(`aio_observations`/`aio_citations`)은 디바이스·문단·영상 인용 구간이 있어 채팅 답변 테이블(`prompt_runs`)에
  넣으면 손실이 크다. 대신 프롬프트 기준으로 플랫폼별 최신 결과를 합쳐 읽는 조회 계층을 둔다.
- 국가·언어·디바이스 같은 AIO 설정은 브랜드 설정(`brand_aio_settings`)에 둔다.
- 기본 플랫폼 제안은 문장 형태로 한다 — 짧은 검색어형은 AIO, 완전한 질문형은 AI 답변 플랫폼(`suggestSurfaces`). 사용자가 언제든 바꾼다.

## 3. 결정한 것

| 항목 | 결정 |
|---|---|
| AIO 키워드 그룹 4종 | 비교 → 검색 의도 "업체 비교", How-to → "정보 탐색", 브랜드 → 토픽 "브랜드 키워드", 카테고리 → 토픽 "카테고리 키워드". 이미 있는 프롬프트의 분류는 덮어쓰지 않는다 |
| 엔진 이름 | 프롬프트 라이브러리의 "Google AI Overview" → **"Google AI 모드"**(표시 이름만. 엔진 ID `model-google-ai-overview`와 `source: google-ai-overview`는 저장 데이터라 그대로) |
| 순서 | 통합을 YouTube 관리보다 먼저 한다 — 예상 질의를 한 번만 등록하면 된다 |

## 4. 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | `prompt_tracking_surfaces` 테이블, `aio_keywords.prompt_id` 열, 이관 함수·스크립트(미리보기/적용), 엔진 이름 정리 | ✅ |
| 2 | 쓰기 전환: AIO 키워드 추가·보관이 `prompts`(+ AIO 플랫폼)에 쓰고, 라이브러리에서 AIO 플랫폼을 켜고 끄면 AIO 수집 대상(`aio_keywords`)이 따라온다(§5.1). 라이브러리에 플랫폼 열·프롬프트 추가/편집 창의 플랫폼 체크(자동 제안)·"AIO 하루 n회 예정 · 권장 상한 200회" 표시 | ✅ |
| 3 | 읽기 전환: AIO 화면이 프롬프트 문장을 라이브러리(`prompts`)에서 읽고(라이브러리에서 고친 문장이 바로 반영), 용어를 "프롬프트"로 통일(그룹 선택·필터 제거). 표는 **프롬프트별 인용 현황** — AIO에서 인용된 YouTube 영상(우리/타 채널, 채널명, 인용 순서, 구간)만 추적 | ✅ |
| 4 | 정리: `aio_keywords` 제거 | 보류 |

**4단계를 보류한 이유**: `aio_keywords`는 이제 "이 브랜드의 이 프롬프트를 AIO로 수집하는 기록"(id·상태·`prompt_id`)일 뿐이고, 프롬프트 문장·분류는 `prompts`가 원본이다.
관측(`aio_observations.keyword_id`)과 인용·수집 계획이 이 id를 그대로 쓰고 있어서, 테이블을 없애려면 관측 FK와 수집기 계획·URL(`/youtube-aio/[keywordId]`)을 전부 `prompt_id`로 옮겨야 한다.
사용자에게 보이는 이득은 없고 운영 데이터 이관 위험만 있어서, 필요해질 때(예: 브랜드 간 프롬프트 공유가 AIO에서도 필요할 때) 다시 본다.

## 5. 이관 (1단계 결과물)

`migrateAioKeywordsToPrompts`([aioKeywordMigration.ts](../src/lib/backend/database/aioKeywordMigration.ts))가 키워드마다:

1. 같은 조직에 같은 문장의 프롬프트가 있으면 그것을 쓰고(분류 유지), 없으면 그룹 매핑대로 새로 만든다. 출처(`prompt_sources`)에 `aio-keyword` + 키워드 ID를 남겨 역추적한다.
2. 이 브랜드의 추적을 만든다. 보관된 키워드는 보관 상태로, 일시중지·보관 상태의 기존 추적은 활성 키워드 때문에 다시 켠다(보고서에 집계).
3. 추적에 `google-aio` 플랫폼을 켜고 `aio_keywords.prompt_id`를 채운다.
4. 플랫폼이 하나도 없는 기존 추적에는 지금까지 실제로 수집하던 플랫폼(`naver-ai`, `google-ai-mode`)을 기본으로 붙인다.

이미 옮긴 키워드는 건너뛰므로 다시 실행해도 안전하다. 같은 문장이 한 조직의 두 브랜드에 있으면 프롬프트는 하나, 추적은 브랜드마다 하나씩이다.

```bash
npm run db:aio-keywords-to-prompts                    # 로컬 DB 미리보기(변경 없음)
npm run db:aio-keywords-to-prompts -- --apply         # 로컬 DB 적용
npm run db:aio-keywords-to-prompts:prod               # 운영 DB 미리보기 (.env.neon.local)
npm run db:aio-keywords-to-prompts:prod -- --apply    # 운영 DB 적용
```

운영에 적용하기 전에 **미리보기 결과(재사용되는 프롬프트 목록 포함)를 확인**한다. 운영 DB에는 Salesforce 조직의 AIO 관측 기록이 있다.
1단계는 읽기 경로를 바꾸지 않으므로 화면 동작은 그대로다(적용 후에도 `aio_keywords`가 계속 화면의 원본이다).

## 5.1 2단계 — 두 저장소를 맞추는 규칙 (읽기는 아직 `aio_keywords`)

3단계에서 읽기를 옮기기 전까지 AIO 수집과 화면은 `aio_keywords`를 읽는다. 그래서 쓰기는 양쪽에 하고([store.ts](../src/lib/backend/database/store.ts) `syncAioKeyword`), 규칙은 하나다:

- **AIO 플랫폼이 켜진 활성 추적 ↔ 활성 AIO 키워드.** 플랫폼을 켜면 키워드를 만들거나 되살리고(그룹은 검색 의도/토픽에서 역산, 모르면 category), 끄거나 추적을 보관하면 키워드를 보관한다.
  추적을 다시 켜면(라이브러리에서 다시 추가) 키워드도 되살아난다.
- **이 시스템이 이미 이은(`prompt_id`) 키워드만 끈다.** 같은 문장의 AIO 키워드가 아직 이어지지 않았다면(이관 전) 라이브러리에서 프롬프트를 새로 추가해도 그 키워드를 보관하지 않는다.
- **AIO 화면에서 키워드 추가**(`linkAioKeyword`): 프롬프트를 만들거나 재사용하고(분류 유지) 추적을 만들어 AIO 플랫폼만 켠다. 이미 이어진 키워드를 다시 추가하면 보관해 뒀던 추적과 플랫폼을 되살린다.
- **AIO 화면에서 키워드 보관**(`unlinkAioKeyword`): 추적에서 AIO 플랫폼만 끄고, 다른 플랫폼이 하나도 없으면 프롬프트도 보관한다(라이브러리에 수집처 없는 프롬프트가 남지 않게). 다른 플랫폼이 있으면 그것들은 그대로 둔다.
- 새 추적의 기본 플랫폼은 지금까지 라이브러리가 수집하던 것(네이버 AI·Google AI 모드). 프롬프트 추가 창은 문장 형태로 제안한 플랫폼을 미리 체크하고(짧은 검색어형 → AIO, 질문형 → AI 답변 플랫폼), 사용자가 직접 고르면 그 선택을 유지한다.
- 플랫폼은 프롬프트를 추가·편집하는 창과 `/api/tracked-topics`(POST·PATCH의 `surfaces`)에서 바꾼다. 플랫폼을 하나도 안 고르면 400이다.

## 6. 화면 계획

- **프롬프트 라이브러리**(2단계 완료): 플랫폼 칩(AIO / AI 모드 / 네이버) 열, 프롬프트 추가·편집 창의 플랫폼 체크(기본값은 `suggestSurfaces`). 플랫폼별 마지막 수집 시각은 3단계.
- **YouTube AIO 인용**(3단계 완료): 별도 등록 화면이 아니라 AIO 플랫폼이 켜진 프롬프트를 보는 화면. "프롬프트 추가"는 그룹 없이 프롬프트만 받고 라이브러리에도 등록한다.
  표는 "프롬프트별 인용 현황"으로 — AIO에서 YouTube가 인용됐을 때 **어떤 프롬프트에서 어떤 영상이 인용됐는지**만 추적한다(프롬프트 · AIO · 인용된 YouTube 영상 · 수집일. 그룹·순서·7일 변화 열은 뺐다).
  영상마다 우리 채널/타 채널 표시, 채널 이름(영상 캐시), 인용 순서와 구간, YouTube 링크가 붙는다. 상단 통계 카드와 추이 차트는 그대로다.
- **YouTube 관리**(예정): 예상 질의를 한 번만 등록하고 플랫폼을 고른다.

## 7. 알아 둘 점

- `neodigm_data_collection_pipeline.md`(§3.2b)에는 예전 이름("Google AI Overview")이 남아 있다. 그 문서의 "구글 AI Overview 답변 수집"은 실제로 AI 모드 수집이다.
- AIO 수집은 하루 상한이 있으므로, 플랫폼을 켠 프롬프트가 많아지면 수집 대상 선택(우선순위)이 필요하다.
