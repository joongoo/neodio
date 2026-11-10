# 제품 범위

| 항목 | 내용 |
| --- | --- |
| 분류 | 기획 기준 |
| 용도 | P0에 포함할 화면과 데이터 소스를 결정할 때 참고 |
| 상태 | 초기 범위 기준 · 현재 구현은 코드 확인 |
| 확인 기준 | 현재 구현은 연결된 코드와 운영 설정 |

이 문서는 초기 P0 범위 결정과 화면별 판단 근거를 보존한다. 아래 §1의 소스 상태는 2026-11 코드 기준으로 갱신했으며, §2~§3의 화면별 판정과 진행 순서는 작성 당시 기획이다. 현재 라우트·데이터 경로는 `src/app/`과 각 기능 문서를 기준으로 확인한다.

관련 문서: `screen-spec.md`(Figma 24개 화면 전체 스펙), [수집·가공 파이프라인](../data/collection-pipeline-spec.md)(소스별 설계와 구현 가이드).

---

## 1. P0 원칙

**P0 화면은 우리가 지금 직접 수집·호출할 수 있는 데이터만으로 채운다.** 아래 소스 밖의 지표(검색량, 난이도, 오디언스, 오가닉 트래픽 등 3rd-party SEO/애널리틱스 지표)는 P0에 넣지 않는다 — 화면은 그리되 해당 지표는 빼거나 다음 단계로 미룬다. LLM을 직접 API로 호출하는 것은 여기서 말하는 "3rd-party 의존"이 아니다 — 우리가 통제하는 호출이고 원문 답변을 그대로 보존하므로 스크래핑과 동일한 신뢰도의 P0 소스로 취급한다.

**P0 소스의 현재 구현 (2026-11 코드 기준)**

| 소스 | 현재 코드 경로 | 상태 |
| --- | --- | --- |
| 공식 LLM API | `src/lib/backend/llm/providers/gemini.ts`, `scripts/collect-llm.ts` | Gemini 어댑터 구현. 다른 제공자는 등록부 기준으로 별도 확인 |
| 네이버 AI 답변 | `scripts/collect-naver-ai.mjs` | 수집기 구현 |
| Google AI 모드 | `scripts/collect-google-ai.mjs` (`udm=50`) | 수집기 구현. 일반 검색의 AIO와 다른 표면 |
| Google AI Overview | `scripts/collect-google-aio.mjs`, `src/lib/backend/aio/` | 별도 수집·판정·저장 구현 |
| 자사 사이트 분석 | `scripts/crawl-sitemap.mjs`, `src/lib/backend/sitemapCrawlReader.ts` | 사이트맵 크롤·결과 조회 구현 |
| 토픽·질문 제안 | `src/app/api/prompt-research/route.ts` | Gemini 기반 제안 경로 구현. 검색량·난이도 수치는 만들지 않음 |
| Google Search Console | `src/app/api/connections/gsc/oauth/`, `src/lib/backend/gscSearchAnalyticsReader.ts` | OAuth·실측 검색 성과 조회 구현 |

모든 LLM 소스(글로벌 API + 네이버/구글 스크래핑)는 동일하게 `prompt_runs` → `mentions`/`citations`/`visibility_scores` 파이프라인을 공유한다 (`collection-pipeline-spec.md` §3). 화면 쪽 판정(§2)은 이 공유 파이프라인의 존재를 전제로 하므로, 글로벌 LLM API가 붙어도 화면별 P0 판정 자체는 바뀌지 않는다 — 언급/인용 데이터의 소스(모델) 종류가 늘어날 뿐이다.

**초기 기획 — 프롬프트 전략용 주간 인사이트 배치**: 주간 스케줄링 시 그 시점까지 쌓인 GSC 실측 데이터 + 우리 mentions/citations 현황을 컨텍스트로 LLM에 "인사이트 브레인스토밍"을 요청해, `PromptStrategySuggestion`/`PromptStrategyTopicRow`(아래 §2 프롬프트 전략 행 참고)와 동일 포맷으로 결과를 받아 그대로 적재한다. 지금은 이 포맷에 맞춘 mock으로 화면만 구성하고, 실제 배치 잡은 미구현.

**P0에서 제외 (3rd-party 또는 별도 인프라 필요)**: Semrush류 키워드 API(검색량/난이도/오디언스/오가닉 트래픽), Reddit/YouTube/Wikipedia API, CDN 로그, 애널리틱스(GA) 연동. 전부 `collection-pipeline-spec.md`의 소스 #4~#10에 이미 설계돼 있으므로 나중에 그대로 재사용. GSC는 위 표에 있듯 P0로 승격됨 — 이 목록에서 제외.

---

## 2. 화면별 P0 판정 (초기 기획 기록)

### P0 포함

| 화면 | 유지 | 제외/변형 |
| --- | --- | --- |
| 개요 | 콘텐츠 가시성, 체크리스트, 통계카드(가시성 점수/브랜드 언급/인용 수), 감성 분포, 마켓 비교(언급·인용만), 최신 기회 | 트래픽 추이(에이전틱/리퍼럴)는 CDN·애널리틱스 필요 — 위젯은 유지하되 "데이터 없음" 상태로, 실제 연동 전까지 배치 |
| 가시성 개요 | 통계카드 4개 중 AI Visibility/Mentions(우리 파이프라인 산출), 모델별/마켓별 언급 차트, "성과가 좋은 프롬프트"(우리가 추적하는 프롬프트 한정), "최신 상위 브랜드", "인용된 페이지/소스"(우리 citations 집계) | Monthly Audience 통계카드 제외. "토픽 기회"·"소스 기회" 테이블은 검색량/오가닉 트래픽 컬럼 제외하고 "우리가 아직 추적 안 한 토픽/도메인" 정도로 축소 |
| 프롬프트 리서치 | 통계카드(고유 토픽/프롬프트/브랜드/소스 도메인 수 — 우리 실행 결과 집계), 관련 토픽(LLM 브레인스토밍, 관련도는 LLM 분류), 브랜드/소스 도메인 테이블(우리 citations·mentions 집계) | "관련 토픽 AI 검색량" 통계카드 제외, 토픽 테이블의 "검색량" 컬럼 제외, 소스 도메인 테이블의 "오가닉 트래픽" 컬럼 제외 |
| 브랜드 가시성 | 통계카드 3개, 감성 분석, 데이터 인사이트/쉐어 오브 보이스 테이블(우리 mentions/citations 기반) | 그대로 P0 |
| 프롬프트 라이브러리 | 전체 | 우리 자체 CRUD라 3rd-party 의존 없음 |
| URL 인스펙터 | 자사 인용 URL/제3자 인용 URL/인용된 도메인 테이블(citations 기반), sitemap 기반 자사 URL 목록 | "실행 수" 등 트래픽성 지표는 CDN 로그 필요 — 제외 |
| 기회 – Template B (robots.txt 진단) | 전체 | robots.txt fetch만 있으면 됨, 3rd-party 없음 |
| 기회 – Template C (콘텐츠 복구) | 전체 | 우리가 이미 하는 Playwright 렌더링 비교로 "AI가 JS 콘텐츠를 못 읽는 페이지" 판정 가능 |
| 프롬프트 전략 | 추천 카드·토픽 테이블 — 소스를 GSC(실측 노출) + LLM 브레인스토밍(주간 배치로 현재 데이터 기반 인사이트 요청, 동일 포맷으로 수집)으로 재구성 | 원래 소스 3개(GSC/Semrush/합성 페르소나) 중 Semrush·합성 페르소나 제외. 필터 탭도 전체/GSC/LLM 브레인스토밍 3개로 축소. GSC/LLM 실측 연동 전까지는 이 문서와 동일 포맷의 mock으로 화면만 구성 |

### P0 제외

| 화면 | 제외 사유 |
| --- | --- |
| 마켓 비교 | 오디언스 지표가 Semrush류 필요 (언급/인용만 남기면 가시성 개요와 중복도가 높아 화면 자체를 보류) |
| 브랜드 전략 (Claims) | Reddit/YouTube/Wikipedia 클레임 마이닝 — 별도 파이프라인 필요 |
| 기회 – Template D-1/D-2 (Reddit/YouTube 감성) | 상동 |
| 기회 – Template A (표준 최적화) | 엣지 배포 인프라 전제 — 인프라 없이는 실행 불가 |
| 에이전틱 트래픽 / 트래픽 인사이트 / 비즈니스 임팩트 | CDN 로그·GA·전자상거래 연동 필요 |
| 연결 관리, 도움말, 브랜드 관리(설정류) | 데이터 신뢰도 이슈 없음 — P0 우선순위에서만 낮음, 나중에 아무 때나 추가 가능 |

---

## 3. 초기 진행 순서 (현재 작업 목록 아님)

1. **(현재 문서)** 범위 고정 — 완료
2. Figma에 `Neodio` 페이지 신설, `Korean` 페이지에서 P0 화면만 복제 후 위 표의 "제외" 컬럼대로 필드/카드 제거
3. `Neodio` 페이지 기준으로 코드 구현 (기존 컴포넌트 재사용 원칙 유지)
4. 사이트 크롤링(sitemap 기반) + LLM 토픽 브레인스토밍 수집기 추가 (`scripts/collect-*` 패턴 재사용)
5. P0 제외 목록은 `collection-pipeline-spec.md`에 이미 설계돼 있으므로, 3rd-party 연동이 확보되는 시점에 그대로 이어서 구현
