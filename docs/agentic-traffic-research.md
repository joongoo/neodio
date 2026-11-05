# 에이전틱 트래픽 조사와 neodio 설계안

2026-11-05 조사. 분석·설계 문서이며 코드는 변경하지 않았다. 출처가 있는 사실과 추정을 구분해 표시한다.
배경: LLMO의 차별점이 "AI 크롤러·에이전트의 실제 방문 측정(CDN 로그)"이라고 판단했고, 오픈소스 6개 조사에는 이 영역이 없었다(`oss-research/00_SYNTHESIS.md` §1-5).

## 1. 결론

1. **측정 대상은 3종류로 나눠야 한다**: 학습용 크롤러 / 검색 색인용 크롤러 / **사용자 요청으로 페이지를 가져가는 에이전트**. 셋은 의미가 전혀 다르고, 이 구분을 공식 문서가 직접 제공한다. 세 번째가 "누군가 AI에게 물었고 AI가 우리 페이지를 읽었다"는 가장 강한 신호다.
2. **UA 문자열만으로는 진위를 알 수 없다.** OpenAI, Anthropic, Perplexity, Google은 모두 검증용 IP 목록(또는 역DNS 방법)을 공개한다. UA가 맞아도 IP가 목록에 없으면 "위장 가능"으로 따로 분류해야 정확도 우선 원칙에 맞는다.
3. **JS 태그로는 못 잰다**(봇은 보통 JS를 실행하지 않는다 — 일반 지식, 이번에 출처 미확인). 서버·엣지 로그나 서버 측 스니펫이 필요하다.
4. **고객 설치 부담이 가장 큰 장벽**이다. 그래서 "로그 파일 업로드"를 0단계로 두어 연동 없이 가치를 먼저 보여주는 순서를 제안한다.
5. **네이버 AI 브리핑 전용 크롤러의 공식 UA는 확인하지 못했다**(검색 결과에 없음). 네이버 검색봇 `Yeti`만 확인. 한국 시장에선 "모르는 봇 수신함"으로 실데이터에서 발견하는 접근이 필요하다.

## 2. 조사한 사실 (공식 문서 기준)

### 2.1 봇 분류와 검증 방법

| 운영사 | 봇(UA 토큰) | 목적 | robots.txt | 검증 |
|---|---|---|---|---|
| OpenAI | `GPTBot` | 학습용 수집 | 따름 | `openai.com/gptbot.json` |
| OpenAI | `OAI-SearchBot` | ChatGPT 검색 결과 노출 | 따름 (막으면 검색 답변에서 빠짐) | `openai.com/searchbot.json` |
| OpenAI | `ChatGPT-User` | 사용자가 묻거나 GPT Actions 사용 시 페이지 방문 | **따르지 않을 수 있음**(사용자 요청이라서) | `openai.com/chatgpt-user.json` |
| OpenAI | `OAI-AdsBot` | ChatGPT 광고 랜딩 페이지 점검 | 미명시 | `openai.com/adsbot.json` |
| Anthropic | `ClaudeBot` | 학습용 수집 | 따름 (Crawl-delay 지원) | `claude.com/crawling/bots.json` |
| Anthropic | `Claude-SearchBot` | 검색 결과 품질용 색인 | 따름 | 동일 |
| Anthropic | `Claude-User` | 사용자 질문에 필요한 페이지 가져오기 | 따름 | 동일 |
| Perplexity | `PerplexityBot` | 검색 결과 노출(학습 아님) | — | `perplexity.ai/perplexitybot.json` |
| Perplexity | `Perplexity-User` | 사용자 질문 시 방문 | 대체로 무시 | `perplexity.ai/perplexity-user.json` |
| Google | `Googlebot` 등 일반 크롤러 | 검색 | 따름 | `common-crawlers.json`, 역DNS(`googlebot.com`) |
| Google | 특수 크롤러(AdsBot 등) | 제품별 | 일부 `*` 무시 | `special-crawlers.json`, 역DNS(`google.com`) |
| Google | 사용자 트리거 가져오기 | 사용자 행동으로 시작 | 대체로 무시 | `user-triggered-fetchers-google.json`, `user-triggered-fetchers.json`, `user-triggered-agents.json` |
| 네이버 | `Yeti` (검색로봇) | 검색 | — | **공식 검증 방법 미확인** |

- 주의(Anthropic 안내): 봇 IP를 차단하면 robots.txt조차 못 읽어 의도한 차단이 안 될 수 있다.
- 검증 방식 두 가지: ① 공개 IP 범위 JSON과 대조(자동화 쉬움) ② 역DNS → 정방향 DNS 일치(Google 문서의 수동 절차). ①을 기본으로 하고 ②는 IP 목록이 없는 운영사에 보조로 쓴다.
- 위 표의 Google "Google-Extended" 같은 제어 토큰과 신규 에이전트(예: 사용자 트리거 에이전트)는 이번 조사에서 상세를 확인하지 못했다(**미검증**). 목록은 정기 갱신이 필요하다.
- Cloudflare는 AI 크롤러를 **검색 / 에이전트 / 학습** 3종으로 묶어 관리한다(문서 기준) — 위 3분류와 같은 발상이다.

### 2.2 로그를 얻는 경로

| 경로 | 확인된 사실 | 한계/미검증 |
|---|---|---|
| **Cloudflare Logpush** (http_requests) | `ClientRequestUserAgent`, `ClientIP`, `ClientRequestHost`, `ClientRequestPath`, `EdgeResponseStatus`, `EdgeStartTimestamp`, `VerifiedBotCategory` 필드가 있다. `BotScore`, `BotTags`, `BotDetectionIDs` 등은 **Bot Management 고객 전용** | Logpush 자체의 요금제 요건은 문서에서 확인하지 못함(**미검증**). 고객이 Cloudflare를 쓸 때만 해당 |
| **Vercel Log Drains** | 임의 HTTPS 엔드포인트로 JSON/NDJSON 전송, `proxy.userAgent`, `proxy.clientIp`, `proxy.path`, `proxy.statusCode`, `host`, `timestamp` 필드 존재. 샘플링 규칙과 OData 필터(예: `contains(log/userAgent,'Googlebot')`)로 **봇만 보내기** 가능 | 요금제 요건·전송 서명 방식은 이번에 미확인(**미검증**). 고객이 Vercel을 쓸 때만 해당 |
| **Vercel 방화벽 "AI Bots" 규칙** | 모든 요금제, Vercel이 알려진 AI 봇 목록을 자동 갱신, "로그" 모드로 차단 없이 기록 가능 | 기록이 어디에 어떤 필드로 남는지 미확인 |
| **원본 서버/웹서버 로그 파일** | 가장 보편적. 형식이 다양(Apache/Nginx 기본 형식) | 대용량, 업로드·정제 필요 |
| **서버 측 스니펫/플러그인** | 요청 시 UA·경로·상태를 수집 서버로 전송(WordPress 플러그인, Next.js 미들웨어 등) | 지연·장애 영향 최소화 설계 필요(비동기, 실패 무시) |
| **JS 분석 태그** | 봇은 대개 실행하지 않아 부적합 | — |

LLMO도 같은 계열이다: 고객 구성 화면에서 CDN 로그 포워딩을 설정하는 방식이라고 Adobe 보안 개요가 설명한다(앞선 대화에서 확인).

## 3. neodio 현황과 간극

- 화면: 에이전틱 트래픽 차트와 개요 카드, "CDN" 연결 카드(`ComingSoonConnectionCard`)가 있지만 **샘플 데이터이고 연동이 없다**(`seedAgenticTrafficLogs`).
- DB: `brands.cdn_connected` 불리언만 있다(저장만 되고 쓰임 없음).
- 기존 설계(`neodigm_data_collection_pipeline.md` §3.4): 요청마다 한 행 저장(`agentic_traffic_logs`: UA, 매칭 봇 이름, 경로, 시각, 상태 코드), 커뮤니티 목록(ai.robots.txt) 기준 봇 매핑, 일/주 롤업.
- 기존 설계의 약점 (이번 조사로 드러난 것):
  1. **진위 검증이 없다**: UA만 믿으면 위장 요청이 지표에 섞인다.
  2. **분류가 "봇 이름 → 유형" 하나뿐**: 사용자 트리거 에이전트와 학습 크롤러를 같은 "에이전틱 트래픽"으로 합치면 의미가 흐려진다.
  3. **요청 단위 원본 저장**은 용량·비용이 크고, **IP가 개인정보**일 수 있어 한국(개인정보 보호법) 맥락에서 부담이다(일반론, 법률 검토 필요).
  4. 연동 경로가 "웹훅 또는 로그 스트림" 하나로만 정의돼 있어 **고객의 호스팅별 현실**을 반영하지 못한다.

## 4. 설계안 (D14: 에이전틱 트래픽 수집·분류)

### 목표
고객 사이트에 AI 봇·에이전트가 **언제, 어떤 페이지를, 어떤 목적으로, 성공/실패하며** 방문했는지를 **검증된 신뢰도**와 함께 집계한다.

### 데이터 흐름
```
[고객 로그 소스] → (정규화 어댑터) → 수신 API → [분류·검증] → [일 단위 집계 저장] → 화면
 업로드/Logpush/Vercel/스니펫        공통 이벤트      봇 레지스트리 + IP 대조   원본 IP는 폐기
```

### 공통 이벤트(정규화 후)
`{ 시각, 호스트, 경로(쿼리 제외), 상태코드, UA, 클라이언트IP, 리퍼러(선택) }` — 어댑터마다 필드 이름이 달라도 이 모양으로 맞춘다.

### 분류 결과 (이벤트 하나당)
- `운영사`(OpenAI/Anthropic/Perplexity/Google/기타/미상)
- `봇`(UA 토큰)
- `목적`: 학습 / 검색 색인 / **사용자 요청 가져오기** / 광고 점검 / 기타·미상
- `진위`: **검증됨**(공개 IP 범위 일치) / **미검증**(UA만 일치, 범위 목록이 없거나 갱신 실패) / **의심**(UA는 봇인데 IP가 공개 범위 밖)
- `미분류 UA`는 버리지 않고 "모르는 봇 수신함"으로 집계(네이버 AI 등 신규 봇 발견용)

### 저장 (집계 우선)
- 단위: (브랜드, 일자, 경로 정규화, 운영사, 봇, 목적, 진위, 상태코드 군) → `횟수`. **원본 IP와 요청 단위 행은 저장하지 않는다**(IP는 분류 직후 폐기, 필요 시 해시 대신 "검증 결과"만 남김).
- 원본 보관이 필요하면 고객이 선택하는 단기 보관(예: 7일)으로 분리하고 기본은 끔.
- 경로는 쿼리 문자열을 제거해 개인정보·토큰 유출을 막는다.

### 지표
1. 봇 운영사·목적별 방문 추이(주 단위)
2. **사용자 요청 가져오기 방문 경로 상위 N** — 어떤 페이지가 실제 AI 답변에 읽히는가
3. 크롤러 4xx/5xx 비율 — AI가 우리 페이지를 못 읽는 경우(기존 "콘텐츠 가시성 회복" 기회와 연결)
4. **robots.txt 차단 vs 실제 방문 교차**: 기존 robots 진단(`robotsTxtReader`)과 결합해 "막았는데 오는 봇(위장 또는 무시)", "허용했는데 안 오는 봇" 표시
5. 사이트맵 URL 중 AI 봇이 한 번도 방문하지 않은 URL 비율 — 기존 설계에서 "에이전틱 URL 커버리지"로 보류돼 있던 지표
6. (후속) AI 서비스 도메인 리퍼러 유입 — 별도 분석 도구 연동 필요, 이번 조사에서 출처 확인 안 함

### 연동 단계 (고객 부담 낮은 순)
| 단계 | 방법 | 목적 |
|---|---|---|
| 0 | **로그 파일 업로드**(수일치, 브라우저에서 분석 후 집계만 전송 가능) | 연동 없이 가치를 먼저 보여 주고 분류기를 현실 데이터로 검증 |
| 1 | 호스팅별 스트림: Cloudflare Logpush, Vercel Log Drains → 수신 API | 자동화. 각 요금제 요건은 구현 전 확인 |
| 2 | 서버 측 스니펫/플러그인(WordPress, Next.js 등) | 위 두 호스팅이 아닌 고객 |
| 3 | 리퍼러/전환 연동 | 후속 |

### 보안·운영 요건
- 브랜드별 수신 토큰(해시 저장), 전송 크기·빈도 제한, 서명 검증(소스가 지원하는 경우).
- 공개 IP 범위 JSON을 주기적으로 받아 캐시(실패 시 마지막 성공본 사용하고 "검증 기한 경과" 표시). **받아오는 URL은 고정 목록**이라 임의 URL 가져오기 위험이 없으나 D10을 거친다.
- 봇 레지스트리는 **버전 관리되는 데이터**(변경 이력, 출처 URL, 확인 일자). 신규 봇 추가 시 과거 데이터는 재분류하지 않고 분류 버전과 함께 기록(D9 재현성 봉투).
- 대량 수신은 D5(내구성 잡 엔진)와 D1(비용)에 맞춰야 한다. 서버리스 환경에서는 수신을 즉시 큐에 넣고 배치로 집계.

### 정확도 검증 (골드셋 방식 적용)
- 분류기: 실제 로그 샘플(각 운영사 방문 + 위장 + 일반 사용자 + 미상 봇)을 사람이 라벨링해 목적·진위 판정의 정밀도·재현율을 측정(D13과 같은 절차).
- 위장 탐지: 공개 범위 밖 IP의 비율을 모니터링해 목록 갱신 지연을 감시.

## 5. 이 설계가 기존 항목과 맺는 관계
- D10(안전한 외부 요청)·D5(잡 엔진)·D1(비용)·D9(재현성)·D13(골드셋)과 같은 틀을 재사용한다.
- 기존 `agentic_traffic_logs`(요청 단위 원본) 설계는 **집계 우선 + 진위/목적 분류**로 대체하는 것을 제안한다. 현재 화면은 샘플 데이터라 마이그레이션 부담이 없다.

## 6. 미해결·확인 필요 (우선순위 순)
1. **네이버 AI 브리핑·AI 검색의 크롤러 UA**: 공식 자료 미확인. 첫 고객 로그에서 직접 관찰해야 한다.
2. Cloudflare Logpush·Vercel Log Drains의 요금제 요건과 전송 인증 방식.
3. Google의 AI 관련 제어 토큰·사용자 트리거 에이전트 최신 목록.
4. 개인정보: 로그에 포함된 IP·경로의 처리 방침(법무).
5. 고객 분포: 우리 고객이 어떤 호스팅/CDN을 쓰는지(없으면 0단계 업로드가 유일한 현실적 시작점).
6. 시장 가치: 에이전틱 트래픽 수치가 실제 구매 결정에 쓰이는 정도(고객 인터뷰 필요 — 이 조사로는 알 수 없음).

## 6-1. 0단계 상세 명세
로그 파일 업로드 분류기는 [agentic-traffic-phase0-spec.md](agentic-traffic-phase0-spec.md)에 구체화했다. 이 문서의 §2.1에 없던 사실 하나: **Anthropic의 IP 목록은 봇(ClaudeBot/Claude-User/Claude-SearchBot)을 구분하지 않는 단일 목록**이라(2026-11-05 직접 확인) 목적은 UA로만 알 수 있고, IP로는 "Anthropic 소유 주소인가"만 검증된다.

## 7. 제안 다음 단계
1. 이번 설계(D14)를 `oss-research/00_SYNTHESIS.md` 순서에 반영
2. **고객 호스팅/CDN 현황 파악**(확인 필요 5) — 가장 저렴하고 방향을 결정
3. 로그 파일 샘플 한두 개(고객 동의하에 또는 자사 사이트 로그)로 분류기 프로토타입을 **문서 수준에서** 시험 — 이것이 0단계

## 출처
- OpenAI 봇 문서: https://developers.openai.com/api/docs/bots
- Anthropic 크롤러 안내: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Perplexity 봇: https://docs.perplexity.ai/guides/bots
- Google 크롤러 개요: https://developers.google.com/crawling/docs/crawlers-fetchers/overview
- Googlebot 검증: https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
- Cloudflare Logpush http_requests 필드: https://developers.cloudflare.com/logs/reference/log-fields/zone/http_requests/
- Cloudflare 검증된 봇: https://developers.cloudflare.com/bots/concepts/bot/verified-bots/
- Vercel Log Drains: https://vercel.com/docs/drains/reference/logs
- Vercel 봇 보호/AI 봇 규칙: https://vercel.com/docs/bot-protection , https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets
- 네이버 검색로봇 Yeti 언급(2차 자료, 공식 아님): https://daleseo.com/robots-txt/
