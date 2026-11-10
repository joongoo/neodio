# 데이터 수집·가공 파이프라인

| 항목 | 내용 |
| --- | --- |
| 분류 | 데이터 설계·구현 가이드 |
| 용도 | 이 주제의 구현 상태, 설계 근거, 다음 작업을 한 곳에서 확인 |
| 상태 | 소스별 설계와 구현 경로를 구분해 확인 |
| 확인 기준 | 현재 동작은 연결된 코드와 운영 설정; 조사·기획은 작성 당시 근거 |

## 읽는 방법

먼저 각 섹션의 상태를 확인하세요. 구현된 기능과 후속 기획을 구분했으며, 상세한 현재 동작은 연결된 코드를 기준으로 합니다.

<a id="section-01"></a>

## 01. 데이터 소스와 수집 설계

백그라운드 프로세스 아키텍처: **[1] Raw 데이터 수집 (스케줄링) → [2] 수집 데이터 가공 → [3] 대시보드 DB화** 3단계를 기준으로, 대시보드가 필요로 하는 모든 데이터 소스별 수집 설계를 정리합니다.

---

### 목차

1. [설계 원칙](#1-설계-원칙)
2. [데이터 소스 전체 인벤토리](#2-데이터-소스-전체-인벤토리)
3. [소스별 상세 설계](#3-소스별-상세-설계)
   - 3.1 [글로벌 LLM 답변 수집](#31-글로벌-llm-답변-수집-chatgpt-gemini-perplexity-copilot-claude)
   - 3.2 [네이버 AI 답변 수집](#32-네이버-ai-답변-수집-신규-p0)
   - 3.2b [구글 AI Overview 답변 수집](#32b-구글-ai-overview-답변-수집-신규-p0)
   - 3.3 [네이버 통합검색 블록 수집](#33-네이버-통합검색-블록-수집-신규-p0)(제외)
   - 3.4 [CDN 로그 / 에이전틱 트래픽](#34-cdn-로그--에이전틱-트래픽)
   - 3.5 [레퍼럴 트래픽 (애널리틱스)](#35-레퍼럴-트래픽-애널리틱스)
   - 3.6 [robots.txt 스냅샷](#36-robotstxt-스냅샷)
   - 3.7 [Google Search Console](#37-google-search-console)
   - 3.8 [Reddit 감성 데이터](#38-reddit-감성-데이터)
   - 3.9 [YouTube 감성 데이터](#39-youtube-감성-데이터)
   - 3.10 [Wikipedia 스냅샷](#310-wikipedia-스냅샷)
   - 3.11 [Adobe Commerce 카탈로그](#311-adobe-commerce-카탈로그)
4. [스케줄링 전략 종합](#4-스케줄링-전략-종합)
5. [가공(Processing) 단계 공통 설계](#5-가공processing-단계-공통-설계)
6. [실패/재시도/레이트리밋 처리](#6-실패재시도레이트리밋-처리)
7. [온디맨드(동기) 경로 — 배치와 분리](#7-온디맨드동기-경로--배치와-분리)
8. [모니터링 / 운영 지표](#8-모니터링--운영-지표)

---

### 1. 설계 원칙

- **[1] 수집(Collect)**: 외부 소스의 raw 데이터를 최대한 가공 없이 그대로 저장. 소스별 원본 테이블에 적재하며, 파싱 실패 대비를 위해 원문(raw text/JSON)을 항상 보존.
- **[2] 가공(Process)**: raw 데이터에서 브랜드 언급/인용/순위/감성 등을 추출해 정규화된 공통 테이블(`mentions`, `citations`, `visibility_scores` 등)로 변환. 소스가 늘어나도 이 공통 테이블 구조는 유지 — 신규 소스는 "raw 테이블 + 이 단계의 어댑터"만 추가.
- **[3] 대시보드 DB화(Serve)**: 화면은 절대 raw/가공 테이블을 직접 재계산하며 읽지 않고, 사전 집계된 캐시 테이블(`visibility_scores`, `opportunities` 등)만 조회. 실시간 재계산 금지 원칙(Overview 화면 가이드에서 이미 확정).
- **소스 간 이질성 흡수**: LLM 텍스트 답변(비정형) vs 검색 랭킹(정형) vs 트래픽 로그(이벤트성)처럼 소스마다 데이터 형태가 다르므로, [2] 가공 단계에서 "소스별 어댑터 → 공통 스키마"로 반드시 정규화한다. 대시보드 쪽 코드가 소스별 분기를 알 필요가 없어야 함.
- **스케줄 vs 이벤트 구분**: 대부분은 주기 배치(cron)로 충분하지만, CDN 로그·레퍼럴 트래픽처럼 실시간성이 있는 소스는 웹훅/스트림 수신 방식이 더 적합.

---

### 2. 데이터 소스 전체 인벤토리

| #   | 소스                                                  | 데이터 형태            | 수집 방식                  | 관련 화면                                              |
| --- | ----------------------------------------------------- | ---------------------- | -------------------------- | ------------------------------------------------------ |
| 1   | 글로벌 LLM (ChatGPT/Gemini/Perplexity/Copilot/Claude) | 자연어 답변            | API 호출 배치              | Overview, Visibility Overview, Prompt Research 등 전역 |
| 2   | 네이버 AI 답변 (`ait` 채팅형)                         | 자연어 답변            | API/헤드리스 브라우저 배치 | 상동 (신규 P0)                                         |
| 2b  | 구글 AI Overview 답변                                 | 자연어 답변            | 헤드리스 브라우저 배치     | 상동 (신규 P0)                                         |
| 3   | 네이버 통합검색 블록(제외)                            | 구조화 랭킹            | API/스크래핑 배치          | Market Comparison 등 (신규 P0)                         |
| 4   | CDN 로그                                              | 이벤트 스트림          | 웹훅/로그 포워딩           | Agentic Traffic                                        |
| 5   | 레퍼럴 트래픽 (애널리틱스)                            | 이벤트 스트림          | 웹훅/애널리틱스 연동       | Traffic Insights, Business Impact                      |
| 6   | robots.txt                                            | 텍스트 파일            | 주기적 fetch               | Opportunity Detail Template B                          |
| 7   | Google Search Console                                 | API 응답(JSON)         | API 배치                   | Manage Connections (GSC 탭)                            |
| 8   | Reddit                                                | 게시물/댓글            | API 배치                   | Opportunity Detail Template D-1                        |
| 9   | YouTube                                               | 영상/댓글              | API 배치                   | Opportunity Detail Template D-2                        |
| 10  | Wikipedia                                             | 문서 스냅샷            | API/스크래핑 배치          | Opportunity Detail Template E                          |
| 11  | Adobe Commerce                                        | 카탈로그(REST/GraphQL) | API 배치 + 실시간 동기화   | Manage Connections (커머스 탭)                         |

---

### 3. 소스별 상세 설계

#### 3.1 글로벌 LLM 답변 수집 (ChatGPT/Gemini/Perplexity/Copilot/Claude)

**무엇을 수집하나**: 등록된 `prompts` 각각을 각 `llm_models`에 실행한 원문 답변.

**수집 방법**

- 각 LLM의 공식 API(OpenAI/Google/Anthropic 등) 또는 API가 없는 서비스(Perplexity 웹, Copilot 등)는 통제된 헤드리스 브라우저 세션으로 질의.
- 요청 단위: `(prompt_id, llm_model_id, market_id)` 조합 하나당 1회 실행.

**스케줄링**

- **주 1회 배치**(DB 스키마 문서의 `prompt_runs.run_at` 기준, Visibility Score "Weekly runs" 공식과 일치).
- 조직/브랜드 수가 늘어나면 병렬 워커 큐(예: SQS/Redis Queue)로 분산, 동일 프롬프트×모델 조합은 배치 윈도우 내 1회만 실행(중복 방지 락).
- `tracked_items`로 신규 추가된 프롬프트는 다음 배치 윈도우에 자동 편입(즉시 실행 아님 — 스케줄 사이클 존중).

**Raw 저장**: `prompt_runs(id, prompt_id, llm_model_id, market_id, run_at, raw_response TEXT, status)`

**가공(Processing)**

1. `raw_response`를 자연어 처리(LLM 재질의 또는 NER/패턴 매칭)로 브랜드명 탐지 → `mentions(prompt_run_id, brand_id, position, sentiment, is_present)`.
2. 답변 내 URL/출처 추출 → `citations(prompt_run_id, domain, page_url, is_own_domain)`.
3. 주간 배치 종료 후 `visibility_scores` 갱신(35% Mentions + 15% Citations + 30% Position + 20% Sentiment).

**실패 처리**: 모델별 rate limit/타임아웃 시 `status='failed'`로 저장 후 익일 재시도 큐에 편입. 3회 연속 실패 시 알림.

---

#### 3.2 네이버 AI 답변 수집 (신규, P0)

**무엇을 수집하나**: 네이버 AI 검색(`ssc=tab.ait.all` 탭, 채팅형 답변)의 자연어 응답.

**수집 방법**

- 공식 API가 없으므로 헤드리스 브라우저로 검색 결과 페이지 진입 → AI 답변 탭 클릭 → `ait_pv=answerEnd`(답변 완료) 상태까지 대기 → 답변 텍스트 + 인용 링크 추출.
- 각 요청은 `ait_chat_id`가 세션마다 새로 발급되므로, 우리 쪽에서 `prompt_run_id`와 매핑해 추적.

**스케줄링**: 글로벌 LLM과 동일하게 **주 1회 배치**, `llm_models`에 `name='Naver AI검색', provider='Naver'` row로 등록해 **기존 배치 파이프라인에 그대로 편입**(별도 스케줄러 불필요).

**Raw 저장**: `prompt_runs`에 그대로 적재(글로벌 LLM과 동일 테이블, `llm_model_id`만 네이버로 구분).

**가공**: 3.1과 완전히 동일한 `mentions`/`citations` 파이프라인 재사용. 단, 한국어 자연어 처리 특성상 브랜드명 탐지에 한국어 형태소 분석(예: 조사 결합형 "네오다임이", "네오다임을" 등) 대응 필요 — 파싱 어댑터에 한국어 전처리 단계 추가.

**확인 필요 사항**

- 네이버 AI 답변 API/약관상 자동화 수집이 허용되는지(스크래핑 정책) 법무 검토 필요.
- `ait_chat_id` 세션이 재현 가능한 요청(동일 쿼리 재실행 시 동일 답변 보장 여부)인지 확인 — 배치 재시도 시 결과 일관성에 영향.

---

#### 3.2b 구글 AI Overview 답변 수집 (신규, P0)

**무엇을 수집하나**: 구글 일반 검색 결과 상단에 뜨는 AI Overview(AI 개요)의 자연어 응답 + 출처 링크.

**수집 방법**

- 로그인 불필요. 일반 검색 URL(`google.com/search?q=...`)을 열면 AI Overview가 페이지 로드 시 바로 렌더링됨 — 네이버와 달리 새로고침 불필요.
- "AI 개요 더보기" 버튼 클릭으로 답변 전문 확장 후 텍스트 추출. 출처 링크는 `rhs-col` 패널(간략히/전체보기 두 리스트가 항상 동시에 DOM에 존재)에서 앵커 전체를 긁어 URL 기준 중복 제거 — 별도 클릭 불필요.
- Playwright 내장 Chromium으로 직접 접속하면 "비정상적인 트래픽 감지" 캡차에 걸림 — 반드시 실제 Chrome 바이너리를 원격 디버깅 포트로 띄운 뒤 CDP(`connectOverCDP`)로 붙어야 함.

**스케줄링**: 네이버와 동일하게 **주 1회 배치**, `llm_models`에 `name='Google AI Overview', provider='Google'` row로 등록해 기존 배치 파이프라인에 편입.

**Raw 저장**: `prompt_runs`에 그대로 적재. `rawMetadata.source='google-ai-overview'`(타입 확정, `src/lib/db/types.ts`).

**가공**: 3.1/3.2와 동일한 `mentions`/`citations` 파이프라인 재사용.

**구현 위치**: `scripts/collect-google-ai.mjs`(수집), `scripts/open-google-ai-chrome.mjs`(실제 Chrome 실행 + CDP 오픈).

---

#### 3.3 네이버 통합검색 블록 수집 (신규, P0)

**무엇을 수집하나**: AI 답변 탭이 아닌 기존 통합검색 결과 — 블로그/카페/지식iN/파워링크/쇼핑 등 블록별 노출 순위와 스니펫.

**수집 방법**: 네이버 검색 API(오픈API로 제공되는 블록: 블로그/카페/쇼핑 등) + API 미제공 블록(파워링크 등)은 통제된 스크래핑.

**스케줄링**: **주 1회 배치**(LLM과 동일 주기로 맞춰 대시보드 시점 일치), 키워드(=`topics`) 단위로 실행.

**Raw 저장 (신규 테이블)**

```
naver_search_results(
  id, organization_id, topic_id FK, keyword,
  block_type ENUM('blog','cafe','kin','powerlink','shopping','news','webkr', ...),
  rank INT, url, title, snippet,
  collected_at
)
```

**가공**

- LLM `mentions`/`citations`와 개념이 다르므로 **정규화 어댑터**를 별도로 둠: `naver_search_results` → (자사 도메인 매칭 시) `citations(is_own_domain=true, ...)`로 변환해 URL Inspector류 화면과 데이터 형태 통일.
- 블록별 순위 자체는 `naver_search_results`에 남겨두고, Market Comparison 등 "네이버 순위 비교"가 필요한 화면은 이 테이블을 직접 조회하는 별도 캐시(`naver_visibility_scores` 등)를 신설 검토.

**확인 필요 사항**

- 파워링크(광고) 블록도 가시성 지표에 포함할지(유료 노출이라 성격이 다름) — 기획 확정 필요.
- 블록 순서/구성이 쿼리마다 달라지는 네이버 UX 특성상 "1위" 정의가 모호할 수 있음(통합검색 배치 순서 자체가 알고리즘적) — 블록 내 순위만 사용할지, 페이지 전체 노출 순서까지 볼지 확인 필요.

---

#### 3.4 CDN 로그 / 에이전틱 트래픽

**무엇을 수집하나**: AI 크롤러(GPTBot, ClaudeBot, PerplexityBot 등)가 브랜드 웹사이트에 접근한 로그.

**수집 방법**: 고객이 Manage Connections > CDN 설정에서 CDN 로그를 우리 쪽으로 포워딩하도록 설정(웹훅 또는 로그 스트림 구독) — CDN 3단계 활성화 구조(기회 잠금 해제 → AI 트래픽 인사이트 활성화 → 최적화 배포)와 연동.

**스케줄링**: **이벤트 스트림(실시간에 가까움)** — 배치가 아니라 CDN이 로그를 밀어줄 때마다 수신. 단, 대시보드 집계는 시간당/일 단위로 롤업.

**Raw 저장**: `agentic_traffic_logs(id, domain_id, user_agent, matched_bot_name, request_path, requested_at)`

**가공**

- `matched_bot_name` → `agent_type`(웹 검색 크롤러/학습 봇/챗봇) 매핑 테이블 필요(ai.robots.txt 커뮤니티 목록 기준, 주기적 목록 갱신 배치 별도 필요).
- 일/주 단위로 URL별·카테고리별·마켓별 롤업 집계 → Agentic Traffic 화면의 각 차트/테이블 소스.

**확인 필요 사항**: ai.robots.txt 목록 누락 시 오탐/누락 허용 범위(기존 REMARK).

---

#### 3.5 레퍼럴 트래픽 (애널리틱스)

**무엇을 수집하나**: AI 답변의 인용 링크를 클릭해 유입된 실제 사용자(휴먼) 트래픽.

**수집 방법**: 고객의 애널리틱스(GA4 등) 또는 자체 트래킹 스니펫 연동, UTM/리퍼러 패턴으로 LLM 유입 판별.

**스케줄링**: 이벤트 스트림(CDN 로그와 유사) + Business Impact 화면용으로는 **주문 시스템과의 세션 매핑을 위해 일 단위 배치 조인** 필요(전자상거래 주문 데이터는 실시간 스트림이 아닐 수 있음).

**Raw 저장**: `referral_traffic_events(id, domain_id, source_llm_model_id, landing_page, session_id, occurred_at)` + Business Impact 확장 컬럼(`order_id`, `revenue_amount`, nullable).

**가공**: 세션 단위로 봇 트래픽(`agentic_traffic_logs`)과 명확히 분리 유지 — 동일 요청이 두 테이블에 중복 집계되지 않도록 User-Agent 기준 사전 필터링.

**확인 필요 사항**: 동의율(Consent Rate) 정확한 정의(쿠키 동의 여부로 추정) 확인 필요 — 확정되면 이벤트에 `consent_given` 컬럼 추가.

---

#### 3.6 robots.txt 스냅샷

**무엇을 수집하나**: 브랜드 도메인의 `robots.txt` 원문.

**수집 방법**: 단순 HTTP GET (`https://{domain}/robots.txt`).

**스케줄링**: **일 1회 배치**(변경 빈도가 낮으므로 주 단위보다 잦게 확인해 변경 이력을 놓치지 않도록).

**Raw 저장**: `robots_txt_snapshots(id, domain_id, raw_content, fetched_at)` — 매 스냅샷을 누적 저장해 변경 이력 추적.

**가공**: User-agent 블록별 Disallow 규칙 파싱 → `agentic_traffic_logs`의 실제 크롤러 접근 시도와 대조해 "어떤 에이전트가 어떤 규칙에 막혔는지" 계산 → Opportunity Detail Template B 데이터 소스.

---

#### 3.7 Google Search Console

**무엇을 수집하나**: 검색 순위, CTR, Core Web Vitals.

**수집 방법**: GSC API(OAuth 연동, 고객이 Manage Connections에서 계정 연결).

**스케줄링**: GSC 데이터 자체가 API상 2~3일 지연(delay)이 있으므로 **일 1회 배치**로 최신 가용 데이터만 가져오면 충분.

**Raw 저장**: `gsc_snapshots(id, domain_id, query, page, clicks, impressions, ctr, position, date)` (신규 테이블, 문서에 미정의 — 설계 시 추가 필요).

**가공**: URL Inspector/Opportunity 화면의 SEO 관련 지표 보강용으로 조인.

---

#### 3.8 Reddit 감성 데이터

**무엇을 수집하나**: 브랜드 관련 서브레딧 게시물/댓글.

**수집 방법**: Reddit API(공식, rate limit 있음).

**스케줄링**: **주 1회 배치**(Opportunity Detail Template D-1과 동일 주기로 맞춤).

**Raw 저장**: `reddit_posts(id, organization_id, subreddit, title, url, sentiment, brand_mention_count, share_of_voice, analyzed_at)`, `reddit_topics`.

**가공**: 감성 분석(LLM 재질의 또는 별도 감성분석 모델 — 미정, 확인 필요)으로 `sentiment` 컬럼 산출.

---

#### 3.9 YouTube 감성 데이터

**무엇을 수집하나**: 브랜드 관련 영상 + 댓글.

**수집 방법**: YouTube Data API.

**스케줄링**: **주 1회 배치**.

**Raw 저장**: `youtube_videos(id, organization_id, video_title, channel_name, sentiment, share_of_voice, top_brand, analyzed_at)`, `youtube_comments(id, video_id FK, sentiment)`.

**가공**: Reddit과 동일한 감성분석 파이프라인 재사용 권장(동일 모델/기준 사용해야 두 템플릿 간 감성 점수가 일관됨).

---

#### 3.10 Wikipedia 스냅샷

**무엇을 수집하나**: 자사 + 경쟁사 위키피디아 문서 구조/내용.

**수집 방법**: Wikipedia API(MediaWiki API, 공식·무료).

**스케줄링**: **주 1회 배치**(문서 변경 빈도가 낮음).

**Raw 저장**: `wikipedia_snapshots(id, organization_id, is_own boolean, company_name, reference_count, section_count, word_count, image_count, category_count, has_infobox, has_toc, has_lead_image, wikipedia_url, last_edited_at, snapshot_at)`, `wikipedia_infobox_fields`(EAV), `wikipedia_reference_quality`.

**가공**: 참고문헌 출처 품질 분류(권위 있는 출처/업계/학술/회사·PR/기타)는 도메인 화이트리스트 기반 규칙 분류 또는 LLM 분류 필요(미정).

---

#### 3.11 Adobe Commerce 카탈로그

**무엇을 수집하나**: 스토어 뷰별 상품 카탈로그.

**수집 방법**: Adobe Commerce REST/GraphQL API, 고객이 Manage Connections > 커머스 탭에서 6개 필드(환경 ID/웹사이트 코드/스토어 코드/스토어 뷰 코드/호스트 이름 등) 입력.

**스케줄링**: 초기 전체 동기화(1회) + 이후 **일 1회 증분 동기화**(카탈로그 변경 반영 목적). 실시간성이 필요하면 Commerce 쪽 webhook(상품 변경 이벤트) 수신도 검토 가능.

**가공**: 제품명/설명 AI 생성 제안 시 카탈로그 필드 제한(최대 글자 수) 적용.

---

### 4. 스케줄링 전략 종합

| 소스                 | 방식                                | 주기                         |
| -------------------- | ----------------------------------- | ---------------------------- |
| 글로벌 LLM 답변      | 배치 큐                             | 주 1회                       |
| 네이버 AI 답변       | 배치 큐 (LLM과 동일 파이프라인)     | 주 1회                       |
| 네이버 통합검색 블록 | 배치                                | 주 1회                       |
| CDN 로그             | 웹훅/스트림 수신                    | 실시간 (집계는 일/시간 롤업) |
| 레퍼럴 트래픽        | 웹훅/스트림 수신 + 매출 조인은 배치 | 실시간 + 일 1회 조인         |
| robots.txt           | 배치                                | 일 1회                       |
| GSC                  | 배치                                | 일 1회 (API 자체 지연 2~3일) |
| Reddit               | 배치                                | 주 1회                       |
| YouTube              | 배치                                | 주 1회                       |
| Wikipedia            | 배치                                | 주 1회                       |
| Commerce             | 초기 전체 + 증분 배치               | 초기 1회 + 일 1회            |

**공통 스케줄러**: 주 1회 배치 소스들은 동일한 cron 윈도우(예: 매주 월요일 00:00 UTC)에 큐잉해 `prompt_runs.run_at`, `visibility_scores` 집계 시점을 일치시키는 것을 권장 — 대시보드의 "마지막 업데이트" 시각이 소스마다 제각각이면 사용자 혼란 발생.

---

### 5. 가공(Processing) 단계 공통 설계

모든 소스는 최종적으로 다음 중 하나 이상으로 정규화되어야 합니다:

- **`mentions`**: 브랜드가 언급된 사실 (LLM 답변, 네이버 AI 답변, Reddit/YouTube 텍스트에서 파싱)
- **`citations`**: 특정 URL이 인용/노출된 사실 (LLM 답변 인용, 네이버 검색 블록, CDN 로그의 크롤링 대상)
- **`visibility_scores`**: 위 두 가지 + Position/Sentiment를 주간 가중합
- **소스 전용 확장 테이블**: 위 3개로 완전히 환원되지 않는 소스 고유 정보(예: Wikipedia의 인포박스 필드, Reddit의 서브레딧명)는 각 소스 전용 테이블에 유지하고, 대시보드 화면은 필요 시 공통 테이블 + 소스 전용 테이블을 조인.

**감성분석 파이프라인 통일**: Brand Presence/Brand Claims/Reddit/YouTube 4곳에서 각각 감성(Sentiment) 판정이 필요한데, 소스마다 다른 모델/기준을 쓰면 대시보드 전체의 감성 점수가 일관되지 않습니다. **하나의 공용 감성분석 서비스(내부 마이크로서비스 또는 공용 LLM 프롬프트 템플릿)**를 만들어 모든 소스가 호출하도록 설계 권장.

---

### 6. 실패/재시도/레이트리밋 처리

- 소스별 API rate limit을 고려해 **소스별 독립 큐**로 분리(하나가 막혀도 다른 소스 수집에 영향 없도록).
- 각 raw 테이블의 `status` 컬럼(pending/success/failed)으로 실행 상태 추적, 실패 시 지수 백오프(exponential backoff) 재시도.
- 네이버(공식 API 부재로 헤드리스 브라우저 의존)와 Reddit/YouTube(공식 API지만 엄격한 rate limit)는 특히 실패율이 높을 것으로 예상 — 재시도 정책을 더 관대하게(최대 재시도 횟수↑) 설정 권장.
- 3회 연속 실패 시 운영팀 알림(Slack/이메일) + 해당 배치 사이클은 이전 성공 데이터로 대시보드 유지(값이 갑자기 0으로 떨어지는 것 방지 — Overview 화면 가이드의 "0으로 표시 금지" 원칙과 동일).

---

### 7. 온디맨드(동기) 경로 — 배치와 분리

**Prompt Research 화면**만 예외적으로 사용자가 토픽을 입력하면 즉시 결과를 봐야 하므로, 위 배치 파이프라인과 별개로 **동기 API**가 필요합니다.

- `POST /prompt-research { topic, market, model }` 호출 시: 그 자리에서 LLM 1~2개(대표 모델)에 실시간 질의 → 즉시 파싱 → 응답 반환. 배치 파이프라인의 `prompt_runs`에도 동일하게 기록해 두 경로의 데이터가 합쳐지도록 함.
- 네이버 AI 답변도 동일하게 온디맨드 호출 가능해야 함(단, 헤드리스 브라우저 방식이면 동기 응답 속도가 느릴 수 있어 UX상 로딩 상태 처리 필요).
- 동일 topic 재입력 시 캐시된 배치 결과 우선 반환(불필요한 재실행 방지) — 이미 확정된 원칙.

---

### 8. 모니터링 / 운영 지표

배치 파이프라인 자체의 헬스체크를 위해 다음 지표를 최소한 추적할 것을 권장합니다(현재 와이어프레임에는 없는 항목이므로 내부 운영 대시보드로 별도 구축 검토):

- 소스별 마지막 성공 수집 시각(`last_success_at`)
- 소스별 이번 배치 성공/실패 건수
- 네이버 AI 답변/통합검색 — 스크래핑 방식 특성상 **차단(블로킹) 감지** 지표(연속 실패율 급증 시 알림)
- API 소스(GSC/Reddit/YouTube/Wikipedia/Commerce) — rate limit 잔여량 추적

---

_이 문서는 `screen-spec.md`(화면별 Description/개발가이드)와 별도로, 백엔드 데이터 수집 파이프라인만 전담해서 정리한 문서입니다. 화면 단위 세부 스펙은 해당 문서를 참고하세요._

<a id="section-02"></a>

## 02. 백엔드 수집·가공 구현 가이드

이 문서는 현재 저장소에서 구현한 백엔드 수집/가공 방향을 재현하기 위한 작업 가이드입니다. 상위 설계는 `collection-pipeline-spec.md`를 따르고, 이 문서는 실제 코드 위치, 실행 명령, 데이터 계약, 다음 개발 순서를 고정합니다.

### 1. 현재 목표

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

### 2. 주요 파일

| 파일 | 역할 |
| --- | --- |
| `scripts/collect-naver-ai.mjs` | 네이버 AI 브리핑 수집 테스트 CLI |
| `scripts/parse_naver_ai_html.py` | 렌더링된 네이버 AI HTML을 BeautifulSoup로 파싱 |
| `scripts/process-raw.ts` | 수집 raw JSON을 processed JSON으로 변환하는 CLI |
| `src/lib/db/types.ts` | raw/processed/dashboard seed 타입 |
| `src/lib/db/data/seed.ts` | 2달치 Neodigm 기준 raw seed |
| `src/lib/backend/processing/date.ts` | 주간 bucket 유틸 |
| `src/lib/backend/processing/text.ts` | 브랜드/alias mention 탐지, sentiment heuristic |
| `src/lib/backend/processing/mentions.ts` | `prompt_runs.rawResponse` -> `mentions` |
| `src/lib/backend/processing/citations.ts` | `rawMetadata.citations` -> `citations` |
| `src/lib/backend/processing/visibility.ts` | visibility score 계산 |
| `src/lib/backend/processing/index.ts` | processing facade |

### 3. Raw 데이터 계약

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

### 4. 네이버 AI 브리핑 수집

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

네이버 답변 URL을 그대로 지정해서 실행:

```bash
npm run collect:naver-ai -- \
  --url="https://search.naver.com/search.naver?ssc=tab.ait.all&sm=top_clk.aitab&dtm_source=main&dtm_medium=searchbox&dtm_detail=empty&ait_pv=answer&query=..." \
  --query="b2b 통합 마케팅 솔루션 추천"
```

실제 Chrome 채널을 시크릿/isolated context로 열어서 실행:

```bash
npm run collect:naver-ai -- \
  --browser-channel=chrome \
  --incognito \
  --headed \
  --query="아기랑 함께 가기 좋은 국내 여행지 추천" \
  --timeout-ms=90000 \
  --min-wait-ms=20000
```

쿠키/세션 오염을 막기 위해 기본값은 persistent profile이 아닌 isolated context입니다. `--user-data-dir`는 세션 재현 디버깅용으로만 사용하고, 정식 수집 테스트에서는 `--incognito`를 사용합니다.

브라우저에서 복사한 DOM 조각으로 selector를 디버그:

```bash
npm run collect:naver-ai -- \
  --html-file="/path/to/pasted-text.txt" \
  --url="https://search.naver.com/search.naver?ssc=tab.ait.all&ait_pv=answer&query=..." \
  --query="b2b 통합 마케팅 솔루션 추천"
```

BeautifulSoup parser만 분리해서 실행:

```bash
python3 -m venv .tmp/venv
. .tmp/venv/bin/activate
pip install -r requirements-backend.txt

npm run parse:naver-ai-html -- \
  --html-file="/path/to/rendered-naver-ai.html" \
  --url="https://search.naver.com/search.naver?ssc=tab.ait.all&ait_pv=answer&query=..." \
  --query="b2b 통합 마케팅 솔루션 추천"
```

브라우저 렌더링 + BeautifulSoup 방식의 역할 분담:

```txt
Playwright:
  - 네이버 페이지 진입
  - JS 렌더링 대기
  - "자세히 더보기" 클릭
  - screenshot/html 저장
  - 기본적으로 isolated context로 실행해 쿠키를 유지하지 않음

BeautifulSoup:
  - 저장된 rendered HTML 파싱
  - AI 답변 본문 추출
  - 출처 패널 citation 추출
  - promptRun JSON 생성
```

결과:

```txt
.tmp/naver-ai/naver-ai-{timestamp}.json
.tmp/naver-ai/naver-ai-{timestamp}.png
```

현재 추출 기준:

- 페이지: `https://search.naver.com/search.naver?ssc=tab.ait.all&ait_pv=answer&query=...`
- AI 브리핑 root: `.fds-aib-expandable-container` 또는 `.conversation-column`
- 본문: root 내부 `.fds-markdown-p`, `.fds-markdown-h`, `.fds-markdown-li-text`, `.fds-markdown-tr`
- table row는 cell을 ` | `로 join
- overlay citation chip/button/svg는 본문에서 제거
- citation: `[aria-label='출처 정보']` 또는 root 내부의 `.fds-source-overlay-item[href]` / `a[href]`
- 일반 통합검색 결과는 제외

참고:

- `ait_pv=answer` URL은 사용자가 네이버 AI 탭에서 질문한 뒤 만들어지는 답변 URL 형식입니다.
- headless 신규 세션에서 이 URL을 바로 열면 네이버가 `잘못된 접근입니다`를 반환할 수 있습니다.
- 이 경우 AI 브리핑 DOM이 렌더링되지 않으므로 collector는 일반 검색 결과를 fallback으로 수집하지 않고 `empty_ai_briefing` 실패로 저장합니다.
- 이전 검색 결과 진입 방식인 `where=nexearch&ssc=tab.ait.all&query=...`는 일부 쿼리에서 검색 결과 상단의 `AI 브리핑` 카드를 수집할 수 있지만, `ait_pv=answer` 대화형 답변 URL과는 다른 진입 경로입니다.
- 실제 브라우저에서 답변이 보이는데 headless에서 실패하는 경우, 우선 DOM 조각을 `--html-file`로 넣어 selector를 검증합니다. selector 검증이 통과하면 남은 문제는 세션/쿠키/접근 경로 문제로 분리해서 봅니다.
- BeautifulSoup는 JS를 실행하지 못하므로 단독 수집기로 쓰지 않습니다. 반드시 Playwright나 실제 브라우저에서 렌더링된 HTML을 입력으로 사용합니다.

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

### 5. Processing 실행

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

### 6. Mention 처리 스펙

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

### 7. Citation 처리 스펙

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

### 8. Visibility Score 처리 스펙

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

### 9. 현재 처리 결과 예시

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

### 10. 다음 구현 순서

1. `processPromptRuns` 결과를 실제 DB 테이블에 insert하는 adapter 추가
2. Postgres migration 작성
3. `prompt_runs`, `mentions`, `citations`, `visibility_scores` upsert 구현
4. Overview/Visibility Overview가 수동 mock snapshot이 아니라 processed aggregate를 읽도록 전환
5. 네이버 수집기를 queue job으로 감싸기
6. 실패 상태 세분화: `failed`, `blocked_suspected`, `empty_ai_briefing`, `layout_changed`
7. sentiment/brand extraction을 LLM classifier로 교체하되 현재 output contract 유지

### 11. 개발 시 검증 명령

```bash
npm run collect:naver-ai -- --query="B2B 통합 마케팅 솔루션 추천"
npm run process:raw
npm run process:raw -- --include-seed
npx tsc --noEmit
npm run lint
npm run build
```

### 12. 중요한 원칙

- 화면은 raw를 직접 읽지 않습니다.
- raw는 최대한 원문 그대로 보존합니다.
- processor는 같은 raw를 넣으면 같은 processed 결과가 나오도록 deterministic하게 유지합니다.
- provider별 차이는 collector에서 흡수하고, processor 입력은 `PromptRunSeed` 형태로 통일합니다.
- 네이버는 동일 query라도 결과가 달라질 수 있으므로 query 결과를 overwrite하지 않고 매번 새 `prompt_run`으로 저장합니다.
