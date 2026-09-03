# Neodigm 화면 구성 및 개발 문서

Figma 파일 "Neodio" (`2zOWBNHsuIaaC13ESy0WZv`)의 **Korean 페이지**에 정리된 전체 화면별 Description(화면 설명), 확인사항(REMARK), 개발 가이드를 종합한 문서입니다.

---

## 목차

1. [개요 (Overview)](#1-개요-overview)
2. [가시성 개요 (Visibility Overview)](#2-가시성-개요-visibility-overview)
3. [프롬프트 리서치 (Prompt Research)](#3-프롬프트-리서치-prompt-research)
4. [마켓 비교 (Market Comparison)](#4-마켓-비교-market-comparison)
5. [프롬프트 전략 (Prompt Strategy)](#5-프롬프트-전략-prompt-strategy)
6. [프롬프트 라이브러리 (Prompt Library)](#6-프롬프트-라이브러리-prompt-library)
7. [브랜드 가시성 (Brand Presence)](#7-브랜드-가시성-brand-presence)
8. [브랜드 전략 (Brand Claims)](#8-브랜드-전략-brand-claims)
9. [URL 인스펙터 (URL Inspector)](#9-url-인스펙터-url-inspector)
10. [에이전틱 트래픽 (Agentic Traffic)](#10-에이전틱-트래픽-agentic-traffic)
11. [트래픽 인사이트 (Traffic Insights)](#11-트래픽-인사이트-traffic-insights)
12. [비즈니스 임팩트 (Business Impact)](#12-비즈니스-임팩트-business-impact)
13. [기회 (Opportunities)](#13-기회-opportunities)
14. [기회 상세 - Template A (Standard)](#14-기회-상세---template-a-standard)
15. [기회 상세 - Template B (Technical Diagnostic)](#15-기회-상세---template-b-technical-diagnostic)
16. [기회 상세 - Template C (Content Recovery)](#16-기회-상세---template-c-content-recovery)
17. [기회 상세 - Template D-1 (Sentiment, Single-Dimension)](#17-기회-상세---template-d-1-sentiment-single-dimension)
18. [기회 상세 - Template D-2 (Sentiment, Dual-Dimension)](#18-기회-상세---template-d-2-sentiment-dual-dimension)
19. [기회 상세 - Template E (Article Analysis)](#19-기회-상세---template-e-article-analysis)
20. [기회 워크스페이스 (Opportunity Workspace)](#20-기회-워크스페이스-opportunity-workspace)
21. [브랜드 관리 (Brands Management)](#21-브랜드-관리-brands-management)
22. [브랜드 상세 (Brand Detail)](#22-브랜드-상세-brand-detail)
23. [연결 관리 (Manage Connections)](#23-연결-관리-manage-connections)
24. [도움말 및 학습 (Help & Learning)](#24-도움말-및-학습-help--learning)
25. [DB 스키마 (Postgres) — 한국형 LLMO](#25-db-스키마-postgres--한국형-llmo)
26. [레이아웃/모달 감사 요약](#26-레이아웃모달-감사-요약)

---

## 1. 개요 (Overview)

### Description

**1. Logo / Product Title**
컴포넌트: WF Logo Placeholder(Instance, 32×32px) + "Adobe Brand Visibility" 텍스트(Inter Bold 16px).
데이터: 로고 이미지는 `{organization.logoUrl}` 바인딩, 미설정 시 이니셜/기본 아이콘 fallback.
동작: 클릭 시 Overview(홈, 현재 이 화면) 로 이동. 이미 Overview에 있을 경우 no-op.
제품명 텍스트는 고정 문자열(정적), 조직별로 바뀌지 않음.

**2. Organization Dropdown**
컴포넌트: WF Button + Drop-down (라이브러리, Size=Small).
표시 텍스트: `{currentOrganization.name}` (예: "Demo Organization").
동작: 클릭 시 Open=True variant로 전환되며 하단에 소속 조직 리스트(텍스트 전용 row, 최대 N개, 스크롤 가능)가 드롭다운으로 노출됨.
조직 선택 시: 전역 컨텍스트(current org)가 즉시 갱신되고, 현재 페이지를 유지한 채 데이터만 리로드(풀 페이지 리로드 아님).
리스트 정렬 기준: 알파벳순 추정.

**3. Notification Icon**
컴포넌트: WF Icon Button(32×32px, bell 아이콘).
동작: 클릭 시 화면 우측 정렬로 알림 목록 팝오버(리스트형, 항목별 아이콘+제목+타임스탬프)가 아이콘 하단에 노출.
뱃지: 안읽은 알림이 1개 이상이면 아이콘 우상단에 red dot 표시(카운트 숫자 없이 dot만).
항목 클릭 시: 해당 알림과 연관된 페이지/모달로 딥링크 이동 후 해당 알림은 읽음 처리.

**4. Profile Icon**
컴포넌트: WF Icon Button(32×32px, person 아이콘).
동작: 클릭 시 계정 드롭다운 메뉴 노출. 메뉴 항목: 사용자 이름/이메일(비활성 표시), 구분선, "Help & learning"으로 이동 링크, "Log out".
위치: 화면 우측 상단 고정, GNB 최우측.

**5. LNB Sidebar**
구조: 상단 Title 영역(현재 비워둠) + Nav 리스트(1depth 그룹 + 2depth 페이지 링크).
1depth 그룹: 아이콘(17px) + 라벨 텍스트 + 우측 chevron. 클릭 시 하위 메뉴 펼침/접힘 토글(라우팅 없음).
2depth 항목: 좌측 padding 48px(1depth는 24px)로 들여쓰기. 클릭 시 해당 페이지로 라우팅 + Active 배경 적용.
Active 판별: 현재 URL 경로와 항목의 route 값을 매칭.
"Opportunities" 옆 숫자 뱃지: 활성 상태(미해결) opportunity 총 개수, 실시간(폴링) 갱신 여부는 확인 필요.

**6. 상단 필터바**
구성 요소(좌→우): Brand 선택, Date Range, Site, Platform, Category, Market — 총 6개의 WF Button+Drop-down(Small) 인스턴스.
동작: 각 드롭다운은 단일 선택(Radio) 방식으로 추정되며, 선택 즉시 화면 내 모든 위젯이 해당 조건으로 재조회됨(로딩 스피너 필요).
필터 상태는 URL 쿼리 파라미터에 반영되어 새로고침/공유 시 유지되어야 함.

**7. 공유 / PDF로 내보내기**
"공유" 버튼: 현재 필터 조합을 포함한 딥링크(URL)를 생성해 클립보드 복사 또는 공유 모달 오픈.
"PDF로 내보내기" 버튼: 현재 화면 상태를 그대로 PDF로 렌더링해 다운로드. 비동기 생성 시 로딩 토스트 필요.

**8. 개요 화면 사용법 배너**
신규/미숙련 사용자 대상 온보딩 안내 카드. "둘러보기" 버튼 클릭 시 화면 내 주요 요소를 순차 하이라이트하는 투어(tooltip walkthrough) 시작.
배너 자체의 닫기(X) 버튼 유무 및 재노출 정책은 확인 필요.

**9. Content Visibility 링 차트**
좌측 원형 게이지: 0~100% 값을 표시하며, 값 구간별 색상(현재 22% = 빨강)이 다름.
우측: 상태 요약 텍스트 + 설명 + "AI가 못 읽는 콘텐츠 보기" CTA → 해당 문제 URL 목록 화면(URL Inspector 등)으로 이동.
최우측 파란 박스: "몇 분 만에 사이트를 개선하세요" 영업/지원 유도 카피 + 담당팀 연결 CTA(버튼 미표시, 확인 필요).

**10. 온보딩 체크리스트 카드 2개**
"더 많은 인사이트를 확인하는 다음 단계"(진행률 1/6) → 클릭 시 "나의 AI 가시성 여정" 모달 오픈.
"프롬프트 전략 강화하기"(진행률 1/5) → 클릭 시 "나의 프롬프팅 전략" 모달 오픈.
각 카드의 진행률 바(%)는 해당 모달 내 완료된 체크리스트 항목 수 ÷ 전체 항목 수로 계산.
모든 항목이 완료되면 카드 자체가 화면에서 사라지는 것으로 추정.

**11. 통계 카드 5개**
가시성 점수 / 브랜드 언급 / 인용 수 / 에이전틱 상호작용 / LLM 리퍼럴 트래픽 총계.
각 카드 구성: (i) 정보 아이콘(툴팁) + 라벨, 큰 숫자 값, "전주 대비 N%" 증감 텍스트(색상: 상승=초록/하강=빨강/변동없음=회색), 우측 미니 바 차트(최근 4주 추이 추정).

> **가시성 점수(Visibility Score) 툴팁 (확정)**
> "Weighted measure of brand presence. Weekly runs: 35% × Mentions + 15% × Citations + 30% × Position + 20% × Sentiment. Higher scores mean stronger visibility and more consistent brand impact."
> → 브랜드 가시성의 가중 평균 지표. 주간 실행 기준으로 언급(35%)·인용(15%)·포지션(30%)·감성(20%) 가중치 합산.
>
> **브랜드 언급(Brand Mentions) 툴팁 (확정)**: 선택한 전체 기간 동안 브랜드를 언급한 고유 프롬프트 수(Headline) / 주별 브랜드 언급 고유 프롬프트 수(Trend).
>
> **인용 수(Citations) 툴팁 (확정)**: 선택한 전체 기간 동안 브랜드를 인용한 고유 프롬프트 수(Headline) / 주별 브랜드 인용 고유 프롬프트 수(Trend).
>
> **에이전틱 상호작용(Agentic Interactions) 툴팁 (확정)**: AI 에이전트가 웹사이트에 보낸 총 요청 수. AI 챗봇 및 기타 비인간(non-human) 에이전트 트래픽 포함.
>
> **LLM 리퍼럴 트래픽 총계 툴팁 (확정)**: AI가 생성한 답변 내 인용 링크를 클릭해 유입된 실제 사용자(휴먼) 트래픽.

**12. 감성 분포 (Sentiment Distribution)**
주별(4주) 긍정/중립/부정 스택 바 차트. X축: 주간 날짜(월요일 기준), Y축: 미표시(비율 스택 100%).
"자세히 보기" 클릭 시 Brand Presence의 감성 분석 상세 화면으로 이동.

**13. 마켓 비교**
자사 브랜드(⭐ 표시)와 경쟁 브랜드 최대 3~4곳의 인용 수/언급 수 가로 바 차트 비교.
경쟁 브랜드 목록은 Brands Management > Other brands tracking에 등록된 브랜드 기준으로 자동 노출되는 것으로 추정.
"자세히 보기" 클릭 시 Market Comparison 화면으로 이동.

**14. 트래픽 추이**
에이전틱 트래픽 vs 리퍼럴 트래픽 4주 라인 차트, 범례 클릭으로 시리즈 토글 가능.
"자세히 보기" 클릭 시 Agentic Traffic 또는 Referral Traffic 화면으로 이동(어느 쪽인지 확인 필요).

**15. 최신 기회**
Opportunities 중 생성일 기준 최신 3건 프리뷰 리스트. 각 항목: 제목 + 카테고리 배지.
"자세히 보기" 클릭 시 Opportunities > Overview 화면으로 이동.

**16. 모달 · 토스트 체크**
이 화면에서 열리는 모달 2개(나의 AI 가시성 여정 / 나의 프롬프팅 전략) 모두 존재.
토스트: 이 화면은 필터 변경 시 위젯이 즉시 반영되는 구조라 별도 토스트 불필요로 판단.

### 확인사항

- Organization Dropdown 노출 조건: 단일 조직 소속 사용자에게도 드롭다운이 노출되는지, 조직명 텍스트만 고정 표시할지 확인 필요.
- Notification 데이터 구조: 알림 타입(예: opportunity 생성, 리포트 완료 등) 종류와 각 타입별 딥링크 대상 목록 필요.
- Profile 드롭다운 메뉴 항목: 정확한 메뉴 구성(설정 페이지 유무, 언어 변경 등 포함 여부) 확인 필요.
- LNB 펼침/접힘 상태 저장: 사용자별로 기억되는지(로컬스토리지/서버 저장) 확인 필요.
- 필터바 옵션 목록: Platform 드롭다운의 전체 옵션 목록 확인 필요.
- 통계 카드 클릭 동작: 카드 클릭 시 이동할 상세 화면이 정의되어 있는지 확인 필요.
- 마켓 비교 경쟁사 선정 기준: 자동 노출인지 Brands Management 등록 목록 기준인지 확인 필요.
- 트래픽 추이 '자세히 보기' 대상: Agentic Traffic과 Referral Traffic 중 어느 화면으로 연결되는지 확인 필요.
- 개요 화면 사용법 배너 재노출 정책: 닫은 뒤 다시 노출할지, 완전히 숨길지(로컬 플래그) 정책 필요.

### 개발 가이드

1. **페이지 구성 순서**: TopBar(로고+GNB) → Sidebar(LNB) → Main: PageHeader → StatCards(4개, grid 4col) → ChartSection(2개 카드 가로배치) → PromptTable → CTA. 반응형: 1280px 미만에서 StatCards 2x2, ChartSection 세로 스택.
2. **필요 API**: `GET /visibility-summary`, `GET /mentions/trend?groupBy=model|market`, `GET /prompts/top?limit=5` — 모두 read-only.
3. **로딩/에러/빈 상태**: StatCards skeleton, 차트별 개별 에러+재시도, 데이터 없음 시 "첫 배치 실행 전입니다" 안내(0으로 표시 금지).
4. **데이터 갱신 주기/캐싱**: 주 1회 배치 갱신, 프론트 SWR/React Query staleTime 1일 권장, "마지막 업데이트" 노출 권장.
5. **상태관리 범위**: 로컬 상태(필터/로딩)만, 조직/마켓 컨텍스트는 전역 상태 또는 URL 쿼리로 화면 간 유지.

---

## 2. 가시성 개요 (Visibility Overview)

### Description

**2. 필터바 (기간/사이트/마켓/모델)** — 4개 드롭다운: Date Range(기본 최근 4개월), Site, Market, Model. 좌측 Filter Panel 5개는 각 드롭다운 클릭 시 열리는 패널.

**3. 통계 카드 4개 (AI Visibility/Mentions/Monthly Audience/Cited Pages)** — SEMRUSH 기반 지표.

> **AI Visibility Score 툴팁**: AI 가시성 점수는 브랜드가 여러 토픽에서 AI 생성 답변에 얼마나 자주 등장하는지, 다른 브랜드 대비 얼마나 일관되게 노출되는지를 측정. 지난 한 달 기준.
> **Mentions 툴팁**: 이 화면에 포함된 AI 엔진 전반에서 브랜드가 언급된 총 횟수. 선택한 도메인·마켓 기준. 지난 한 달 기준.
> **Monthly Audience 툴팁**: AI 맥락에서 브랜드와 연관된 추정 월간 오디언스 도달 수. 방향성 지표. 지난 한 달 기준.
> **Cited Pages 툴팁**: AI 답변에 인용된 우리 사이트의 페이지 수. 선택한 도메인·마켓 기준. 지난 한 달 기준.

**4. 모델별 언급 수 / 마켓별 언급 수 차트** — 가로 바 차트 2개, 상단 탭(언급 수/가시성/오디언스)으로 지표 전환.

**5. 성과가 좋은 프롬프트 및 토픽 테이블** — 탭 6개로 구성된 종합 테이블 패널. 컬럼: Topic/Volume/Mentions/Visibility/Difficulty/Market/Actions. 행 확장 시 Prompt/Model/Your brand/Brands/Sources/Market/Actions 상세 노출. "Track" 버튼으로 Prompt Strategy에 추적 대상 추가.

**6. Filter Panel 5개 (Date Range/Site/Market/Model/AI Visibility)** — Date Range: 프리셋 7종+직접 설정. Site: Brand URL 3개 중 라디오 선택. Market: 검색+체크박스. Model: 검색+글로벌 시장 점유율(%)+체크박스. AI Visibility: 구간 필터. 하단 Apply/Reset 버튼.

**7. Table Panel - 토픽 기회 (Topic Opportunities)** — 경쟁사는 언급되지만 우리 브랜드는 누락/저평가된 프롬프트·토픽 발굴. Competitors 필터. 컬럼: 토픽/검색량/가시성/경쟁사 총 언급 수(↓)/액션.

> **가시성 툴팁**: 이 브랜드가 등장한 답변의 비율. **검색량 툴팁**: 이 토픽에서 순위를 올리기 얼마나 어려운지 난이도 점수(0~100). **마켓 툴팁**: 이 행의 데이터가 적용되는 마켓, 전세계 결과에는 미표시.
>
> **[Track 버튼 확정 동작]** 클릭 시 `Modal / Add Topic to Configuration`(646:17704) 오픈: 프롬프트를 구성에 추가한다는 안내 + Brand/Category 필수 선택 + "프롬프트는 Prompts management에서 확정하기 전까지 대기(pending) 상태로 저장됩니다" + 취소/추가 후 구성 보기 버튼. 즉시 추가가 아니라 모달을 통해 브랜드/카테고리를 지정해야 pending 상태로 추가되고, 이후 **Prompt Library 화면**으로 이동해 확인/확정하는 2단계 플로우.

**8. Table Panel - 최신 상위 브랜드** — 컬럼: 브랜드/언급 수(↓) 2컬럼만, 가장 단순한 랭킹 테이블.

**9. Table Panel - 인용된 페이지** — 컬럼: 페이지 URL/응답 수(↓)/마켓. 상세 서브행에 "내 브랜드" 컬럼 추가 존재.

**10. Table Panel - 인용된 소스** — 경쟁 관계 없이 전체 인용 소스 랭킹. 컬럼: 도메인/마켓/내 브랜드 언급 수/인용된 페이지 수/프롬프트 수(↓)/오가닉 트래픽. 상세 확장 없음.

**11. Table Panel - 소스 기회** — "토픽 기회"의 소스 버전. Competitors 필터. 컬럼: 도메인/마켓/내 브랜드 언급 수/인용된 페이지 수/프롬프트 수/오가닉 트래픽(↓).

### 확인사항

- 모델별/마켓별 차트 탭 전환 시 X축 범위: 탭 전환 시 X축 단위/최대값이 달라지는지 확인 필요.
- Filter Panel Apply/Reset 버튼 동작: Reset이 해당 패널만 초기화인지 전체 초기화인지 확인 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar(5종, 클릭 시 Filter Panel 오버레이) → StatCards(4개) → ChartSection(탭 전환형) → TablePanel(6개 탭, 클라이언트 state로 전환).
2. **API**: `GET /visibility-summary`, `GET /mentions/trend`, `GET /table-panel?tab={tab}` (6개 탭 공용, tab 파라미터로 분기), `POST /tracked-items`, `GET /export?tab=&format=csv`.
3. **Table Panel 상태 관리**: activeTab 하나로 관리, lazy fetch. Competitors 필터는 탭별 로컬 상태로 탭 전환 시에도 유지. 상세 행 펼침은 id Set으로 관리.
4. **로딩/에러/빈 상태**: StatCards/Chart/TablePanel 섹션별 독립 로딩. 빈 결과 시 안내+필터 초기화 버튼. Export 실패 시 토스트(현재 와이어프레임엔 토스트 컴포넌트 없음).
5. **필터 상태 ↔ URL 동기화**: 5개 세부 필터는 URL 쿼리로 직렬화 권장, 이 화면 전용 상태.
6. **Track 버튼 API 계약 (확정)**: 클릭 시 즉시 API 호출 없이 모달 오픈 → `GET /brands`, `/categories`로 옵션 채움 → "추가 후 구성 보기" 시 `POST /tracked-items { item_type:'topic', item_ref_id, brand_id, category_id }` → status='pending_confirmation' insert → **Prompt Library 화면**으로 라우팅. "취소" 시 요청 없음.

---

## 3. 프롬프트 리서치 (Prompt Research)

### Description

1. **빈 상태(Empty State)** — 헤더+토픽 필터 입력창만 존재, "시작하려면 토픽을 입력하세요" 안내. Enter로 명시적 제출.
2. **토픽 필터 + 마켓/모델 필터** — Topic 자유 텍스트 입력(필수 트리거) + Market/Model 드롭다운(보조 필터).
3. **통계 카드 5개** — Related topics AI volume, Unique topics, Unique prompts, Unique brands, Unique source domains.
4. **Related topics intent 차트** — Informational/Commercial/Transactional 3분류 비율 도넛/바 차트.
5. **3개 탭 패널** — 관련 토픽/브랜드/소스 도메인, 카운트 배지 표시.
6. **관련 토픽 테이블** — 컬럼: 토픽/검색량/프롬프트 수/관련도(↓)/액션. "Track" 버튼으로 프롬프트 관리 편입.
   > **관련도(Relevancy) 툴팁**: 이 토픽이 검색 쿼리와 얼마나 밀접하게 일치하는지, Best/High/Medium/Low 4단계로 표시.
7. **Export/검색** — Export(CSV) + 검색창(0/N).
8. **브랜드/소스 도메인 탭** — 브랜드 탭: 브랜드/언급 수(↓)/소스 도메인 수/프롬프트 예시. 소스 도메인 탭: 소스 도메인/언급 수(↓)/소스 URL 수/오가닉 트래픽/프롬프트 예시. 두 탭 모두 상세 확장 없음.

### 확인사항

- 토픽 미입력 시 마켓/모델 필터 활성 여부: 토픽 입력 전에도 조작 가능한지 확인 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → TopicFilterBar → (빈 상태 | 결과 상태) 조건부 렌더링.
2. **API**: `POST /prompt-research { topic, market, model }` — 단일 엔드포인트로 통계/차트/테이블 데이터 한 번에 반환(실시간성 중요). 동일 topic 재입력 시 캐시 우선.
3. **상태 관리**: `hasSubmittedTopic`으로 빈/결과 상태 분기. `topic/market/model`을 URL 쿼리와 동기화. `activeTab`은 로컬 state.
4. **로딩/에러/빈 상태**: 제출 후 StatCards~Table 영역만 skeleton. 데이터 없는 신규/희귀 토픽은 "데이터가 충분하지 않습니다" 별도 상태.
5. **테이블 헤더 셀 배경 구현 주의사항**: 원본 와이어프레임에서 헤더 행 각 셀이 개별 불투명 흰색 배경을 가져 줄무늬처럼 보이는 버그 발견 및 수정. 헤더 셀 wrapper는 투명 처리, 배경은 행 컨테이너 1곳에만 적용할 것.

---

## 4. 마켓 비교 (Market Comparison)

### Description

1. **비교 대상 선택** — 도메인/Market/Model 드롭다운 + 좌측 "경쟁사" 체크박스 리스트(neodigm.com/hubspot.com/marketo.com/klaviyo.com/braze.com).
2. **마켓 비교 스냅샷 테이블** — 선택 브랜드별 최신 보고일 기준 AI Visibility/Mentions/Audience. 컬럼: 날짜/도메인/AI 가시성(↓)/언급 수/오디언스.
3. **히스토리컬 비교 차트** — 3개 탭(언급 수/가시성/오디언스) 라인 차트, 브랜드별 라인 5개.
4. **토픽 패널** — "분석 대상 경쟁사가 한 곳 이상 언급된 모든 토픽". 전체/미노출/공유/단독 4개 필터 탭. 컬럼: 토픽/토픽 검색량/가시성/언급 수/난이도/총 언급 수(↓)/브랜드별 언급 수(상위 3+"+N개 더")/액션(Track).
   > **Track 버튼**: `Modal / Add Topic to Configuration`(646:17679, 이 화면 전용 인스턴스) — Visibility Overview/Prompt Research와 동일 플로우(Brand/Category 선택 → pending 저장 → Prompt Library로 이동) 재사용 확인됨.
5. **소스 도메인 패널** — 토픽 패널과 동일 헤더/필터 구조이나, ⚠️ 테이블 컬럼·행 데이터가 토픽 패널과 완전히 동일(버그 추정, 확인사항 참고).

### 확인사항

- **소스 도메인 패널 데이터 오류(추정)**: 테이블 컬럼/행 데이터가 "토픽" 패널과 완전히 동일함. 도메인 전용 컬럼이어야 할 것으로 추정 — 와이어프레임 복제 실수인지 의도된 재사용인지 확인 필요.
- 전체/미노출/공유/단독 필터 정확한 정의: 미노출=경쟁사만 언급, 공유=우리+경쟁사 모두, 단독=우리만 언급 — 으로 추정 번역, 정확한 판정 기준 확정 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar(Domain/Market/Model) + CompetitorSelectList(체크박스) → SnapshotTable → HistoricalChart(3탭) → TopicsPanel → SourceDomainsPanel(재검토 필요).
2. **API**: `GET /market-comparison/snapshot`, `GET /market-comparison/history?metric=`, `GET /market-comparison/topics?filter=`. Source domains 패널은 실데이터라면 별도 엔드포인트 필요(현재는 topics 재사용처럼 보임).
3. **경쟁사 선택 상태 관리**: `selectedCompetitors`를 전역 상태로 관리, 4개 섹션 모두 구독. 변경 시 디바운스 권장.

---

## 5. 프롬프트 전략 (Prompt Strategy)

### Description

- **안내 배너**: Google Search Console/Synthetic Personas/Semrush 3개 소스에서 프롬프트 추천. 닫기(×) 가능.
- **추천 카드 3장**: 태그(커버리지 공백/우위를 점한 토픽)+출처+요약+통계+"추천 보기".
- **필터 탭**: 전체(15)/Semrush(8)/합성 페르소나(2)/인용 시도(2)/GSC(3).
- **확장 추천 섹션**: "닫기"/"전체 추적 →"(Modal - Track Topics 오픈) + 토픽 테이블(토픽/마켓/검색량/브랜드별 언급 수, "내 브랜드" 항상 첫 행).

### 확인사항

- 안내 배너 닫기 후 재노출 정책(세션 한정 vs 영구 dismiss) 미정.
- 요약 카드 "추천 보기" 클릭 시 이동 대상 불명확. 3번째 카드의 확장 섹션이 누락되어 있음(데이터 누락 의심).
- "닫기"(추천 무시) 후 영구 삭제인지 복구 가능한지 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader(브랜드 선택) → InfoBanner → SuggestionCards(3) → FilterTabs → ExpandedSuggestionSection(반복).
2. **API**: `GET /prompt-suggestions?brand=&source=` (opportunities 확장 또는 별도 suggestions 테이블).
3. **배지/카운트**: 서버에서 소스별 카운트 집계해 전달(클라이언트 재계산 지양).

---

## 6. 프롬프트 라이브러리 (Prompt Library)

### Description

- **안내 배너**: "개요 영상 보기" 링크 포함.
- **건강도 지표 카드 4개**: 브랜디드/언브랜디드 비율(45%, 목표 30% 초과 시 조치 필요), 토픽 의도 일치도(0/10), 에이전틱 URL 커버리지(8/10), 전략 추천(150개/775.2K 검색량). 각각 "상세 보기 →".
- **필터/액션 바**: 검색+카테고리/서브카테고리+CSV 가져오기/내보내기/프롬프트 추가. 행 선택 시 "삭제" 버튼 추가 노출(Selected State는 별도 화면 아닌 동일 화면의 상태).
- **프롬프트 테이블**: 프롬프트/출처/카테고리/서브카테고리/최종 수정일/수정자/액션. "—"는 시스템 기본 제공 프롬프트로 추정. 총 104개.
- **Modal - Add Prompts**: 다건 등록, Category(필수)/Subcategory/Prompt(필수).
- **Modal - Import Prompts**: CSV 업로드(.csv, 최대 10MB), 필수 컬럼 prompt/category, 선택 subcategory. 템플릿 다운로드 제공.
- **Modal / Edit Prompt**: Category/Subcategory/Prompt 3필드 편집.

### 확인사항

- Import 모달 "미리보기" 클릭 후 화면 미정의.
- 건강도 배지("조치 필요"/"주의 필요") 임계값 불명확.
- 출처(Origin) "—" vs 실값의 정확한 의미(AI 생성/CSV 가져오기/직접 입력 등 라벨) 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → InfoBanner → HealthCards(4) → ActionBar → PromptTable(체크박스 선택, Selected State는 동일 컴포넌트의 상태).
2. **API**: `GET /prompts?category=&subcategory=&search=&page=`, `GET /prompt-library/health`.
3. **선택 상태**: `selectedRowIds`(Set), 1개 이상 선택 시 삭제 버튼 활성화. 필터 변경 시 선택 초기화 권장.

---

## 7. 브랜드 가시성 (Brand Presence)

### Description

- **안내 배너 + 필터바 7종**: 기간/카테고리/토픽/플랫폼/프롬프트 출처/프롬프트 브랜딩/마켓. (마켓 트래킹 섹션은 예외적으로 이 필터를 구독하지 않음)
- **통계 카드 3개 + 마켓 트래킹**: 가시성 점수/브랜드 언급 수/인용 수. 마켓 트래킹은 최대 5개 브랜드 체크박스 선택+"필터 적용", 독립 상태.
- **브랜드 언급/인용 수 차트**: 마켓 트래킹 선택 브랜드의 주간 추이 라인 차트.
- **감성 분석 섹션**: 감성 분포(주간 스택 차트) + 프롬프트 지표(감성 감지 프롬프트 수 추이).
- **개선/하락 상위 항목 테이블**: 감성 변화 상위 10개씩. 변화 없으면 빈 상태 표시.
- **데이터 인사이트 테이블**: 11개 토픽 전체, 컬럼 다수. "상세" → Modal / Brand Presence Details. 컬럼 커스터마이즈 Modal / Configure Columns(646:13264).
- **쉐어 오브 보이스 테이블**: 토픽별 1~5위 브랜드 점유율. "설정된 브랜드만" 토글. 별도 Configure Columns 모달(646:13265) 존재.
- **Brand Presence Details 모달**: Metrics + 자사/제3자 인용 2개 테이블 + 메타 정보.

### 확인사항

- **Configure Columns 모달 2종 혼용**: 쉐어 오브 보이스용(646:13265)이 데이터 인사이트용(646:13264)과 다른 헤더/컬럼 목록을 가짐 — 잘못 연결된 것으로 추정.
- 감성(Sentiment) 판정 임계값/산출 방식 미정(DB 스키마 `mentions.sentiment`와 연계 필요).
- Configure Columns의 "Executions" 컬럼이 실제 테이블에는 노출 안 됨 — 정의 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → InfoBanner → FilterBar(7) → StatCards(3) → MarketTrackingSection → SentimentAnalysisSection → Top/BottomMoversTable → DataInsightsTable → ShareOfVoiceTable.
2. **API**: `GET /brand-presence/summary`, `GET /brand-presence/market-tracking?competitors[]=` 등.
3. **마켓 트래킹의 필터 독립성**: 상단 공통 필터를 구독하지 않는 별도 컨텍스트/쿼리 키로 분리 구현.

---

## 8. 브랜드 전략 (Brand Claims)

### Description

- **요약 헤더 + 추천 다음 단계**: 클레임 총 건수 + 가장 시급한 클레임 하이라이트.
- **주요 클레임 카드 5개**: 클레임 텍스트+카테고리+감성 배지+상세.
- **감성 분포**: 우호적/중립/비우호적 3단계.
- **주요 소스**: 도메인/카테고리/비중(%).
- **전체 클레임 테이블**: 1,873개 클러스터·3,651건. 8종 필터 + 6종 프리셋. "N회 등장"+"학습된 모델"/"인용 N건 근거"로 출처 구분.
- **브랜드명 혼동 클레임 (의도된 콘텐츠)**: "Neodigm"이 무관한 커피 브랜드와 혼동되는 시나리오를 의도적으로 묘사 — 브랜드명 충돌 리스크를 보여주는 예시로 **의도적으로 보존**(리브랜딩 시에도 유지).
- **Claim Details 모달 (인용 있음/없음 2종)**: 공통 메타+"왜 중요한가"+응답 섹션. 인용 있는 버전은 "전체 인용 (N)" 리스트 추가.

### 확인사항

- **BACKUP(pre-redesign) 프레임**: 번역 필요 여부 사용자 확인 대기 중 (84개 텍스트 노드, 미번역 상태로 보존 중).
- 두 Claim Detail 모달(646:13573, 646:17960)의 중복 여부(레이아웃 거의 동일) 확인 필요.
- No Citations 모달의 "전체 답변 보기" 확장 방식 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → TopClaimsCards(5) → SentimentDistribution → PrimarySources → AllClaimsSection → ClaimDetailModal.
2. **데이터 모델 확장**: `claim_clusters`, `claim_evidence` 신규 테이블 필요(mentions/citations만으로 부족).
3. **API**: `GET /claims/summary`, `GET /claims/top?limit=5`, `GET /claims?preset=&sort=...`.
4. **비우호적/우호적 판정**: 기존 sentiment 파이프라인 재사용. impact_level/needs_response는 별도 배치 점수 계산 필요(임계값 미정).

---

## 9. URL 인스펙터 (URL Inspector)

### Description

- **필터바 6종**: 기간/사이트/카테고리/플랫폼/페이지 콘텐츠 유형/마켓.
- **통계 카드 4개**: 자사 인용 고유 프롬프트 수/전체 고유 프롬프트 수/고유 인용 URL 수/총 인용 횟수.
- **인용 시도 / LLM 레퍼럴 유입 수 차트**: CDN 로그 기준 크롤러 요청 vs 실제 사람 방문 비교.
- **자사 인용 URL 테이블**(57개), **인용된 제3자 URL 테이블**(1,261개), **인용된 도메인 테이블**(467개 중 200개) — 모두 "상세" → Modal / URL Details.
- **URL Details 모달**: 인용 추이 차트 + 프롬프트 분석 테이블 + 기회 섹션(빈 상태 있음) + 메타 정보. **이 모달은 URL Inspector/Agentic Traffic/Traffic Insights 3개 화면에서 공용으로 재사용됨(확정)**.

### 확인사항

- "실행 수(Executions)" 정의 — Brand Presence의 동일 용어와 같은 의미인지(전역 지표 가능성) 확인 필요.
- "콘텐츠 가시성(Content Visibility)" 산출 기준 미정(여러 화면에 반복 등장).

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar(6) → StatCards(4) → CitationAttemptsChart+ReferralHitsChart → 3개 테이블 → UrlDetailsModal(공용).
2. **데이터 모델**: 기존 `citations` 재사용(is_own_domain으로 자사/제3자 구분) + 신규 `crawler_hits`(CDN 로그 기반 크롤러 요청, citations와 별개 개념).
3. **API**: `GET /url-inspector/summary`, `/citation-attempts`, `/referral-hits`, `/owned-urls`, `/third-party-urls`, `/domains`, `GET /url-inspector/urls/{id}/details`.

---

## 10. 에이전틱 트래픽 (Agentic Traffic)

### Description

- **필터바 8종** (기간/사이트/카테고리/플랫폼/에이전트 유형/사용자 에이전트/성공률/콘텐츠 유형) — 전 화면 중 가장 많은 필터.
- **통계 카드 4개**: 에이전틱 상호작용/성공률/평균 TTFB/콘텐츠 가시성.
- **도넛 차트 3종**: 카테고리별/마켓별/페이지 유형별 트래픽.
- **트래픽 추이 라인 차트**: 성공/실패/전체 3라인.
- **응답 코드 분포**: 200/404/503 바 차트.
- **개선/하락 상위 항목**: 트래픽 증감 상위 URL 5개씩.
- **사용자 에이전트 분석 테이블**: 페이지 유형×에이전트 유형(웹 검색 크롤러/학습 봇/챗봇) 조합 23개. Configure Columns(646:14060).
- **URL 성과 분석 테이블**(130개): "상세" → URL 단위 상세(공용 모달 추정).

### 확인사항

- "상세" 클릭 시 URL Inspector의 Modal / URL Details를 재사용하는지, 전용 모달이 있는지 확인 필요.
- 에이전트 유형 3분류(웹 검색 크롤러/학습 봇/챗봇) 판정 규칙(User-Agent 패턴) 확인 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar(8) → StatCards(4) → DonutChartRow(3열) → TrendLineChart → ResponseCodeChart → TopMovers/BottomMovers → UserAgentAnalysisTable → UrlPerformanceTable.
2. **데이터 모델**: 신규 테이블 없이 기존 `agentic_traffic_logs`를 다차원 GROUP BY. `matched_bot_name → agent_type` 매핑 테이블(ai.robots.txt 기준) 필요.
3. **API**: `GET /agentic-traffic/summary`, `/breakdown?dimension=`, `/trend`, `/response-codes`, `/movers?direction=`, `/user-agents`, `/urls`.

---

## 11. 트래픽 인사이트 (Traffic Insights)

### Description

- **필터바 7종**: 기간/사이트/카테고리/플랫폼/페이지 의도/기기 유형/마켓 (실사용자 트래픽 전용이라 봇 필터 대신 페이지 의도/기기 유형).
- **통계 카드 3개**: 총 LLM 레퍼럴 트래픽/동의율(Consent Rate)/이탈률.
- **바 차트 3종**: 플랫폼별/마켓별/페이지 의도별.
- **레퍼럴 소스 상세 테이블**: openai/google/perplexity/microsoft/claude — 방문수/이탈률/채널(전부 "획득").
- **URL 성과 분석 테이블**(162개): "상세" → **URL Inspector와 동일한 공용 Modal / URL Details(646:17840) 재사용 확인됨**.

### 확인사항

- 동의율(Consent Rate) 정확한 정의(쿠키 동의 vs 다른 의미) 확인 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar(7) → StatCards(3) → BarChartRow(3열) → ReferralSourcesTable → UrlPerformanceTable(→ 공용 모달).
2. **데이터 모델**: 기존 `referral_traffic_events` 재사용. Agentic Traffic과 동일 엔드포인트 패턴(테이블만 교체).
3. **URL Details 모달 공용화**: URL Inspector/Agentic Traffic/Traffic Insights 3개 화면이 하나의 공용 컴포넌트를 호출 출처(prop)만 다르게 전달해 재사용.

---

## 12. 비즈니스 임팩트 (Business Impact)

### Description

- **필터바 7종**: Traffic Insights와 동일 세트 — 같은 `referral_traffic_events`를 트래픽 품질(Traffic Insights) vs 매출 임팩트(이 화면)로 나눠 보여주는 형제 화면.
- **통계 카드 7개**: 페이지뷰/진입 수/매출/전환율/이탈률/평균 세션 시간/방문당 페이지 수/총 주문 수.
- **바 차트 3종**: 플랫폼별(DeepSeek/ChatGPT/Mistral/Copilot/Grok)/마켓별(US/JP/GB/ES/GLOBAL)/기기별.
- **플랫폼별 트래픽 카드**, **플랫폼별 매출 차트**.
- **플랫폼 소스 상세 테이블**: 9개 플랫폼(Doubao/Cloud 포함) — 방문수/방문자 수/이탈률/매출/주문 수.
- **URL 성과 분석 테이블**(119개): 매출 컬럼 있음, 페이지 의도 컬럼 없음.

### 확인사항

- ⚠️ **URL 테이블에 "상세" 액션 없음** — 다른 모든 화면과 달리 액션 컬럼 자체가 누락(읽기 전용 리포트 의도인지 확인 필요).
- ⚠️ **플랫폼 목록 불일치** — Traffic Insights는 ChatGPT/Gemini/Perplexity/Copilot/Claude, 이 화면은 DeepSeek/Mistral/Grok/Doubao 등 완전히 다른 목록 사용 — 공유 마스터 목록 필요 여부 확인.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar(7) → StatCards(7) → BarChartRow(3열) → PlatformTrafficCards → RevenueByPlatformChart → PlatformSourcesTable → UrlPerformanceTable(읽기 전용).
2. **데이터 모델 확장**: `referral_traffic_events`에 `order_id`(nullable), `revenue_amount`(nullable) 추가 — 전자상거래 주문 시스템과의 세션 매핑이 핵심 전제.
3. **API**: `GET /business-impact/summary`, `/breakdown?dimension=`, `/revenue-by-platform`, `/platform-sources`, `/urls`. 일 단위 배치 갱신 권장(실시간 아님).

---

## 13. 기회 (Opportunities)

### Description

- **검색 + 2단 필터**: 온사이트(전체 9/콘텐츠 최적화 4/기술적 GEO 2/기술적 SEO 1/커머스 2), 오프사이트(전체 4/획득 콘텐츠 2/소셜 및 커뮤니티 2).
- **온사이트 콘텐츠 최적화 (6개 카드)**: 복잡한 콘텐츠 단순화/LLM 친화적 요약 추가/관련 FAQ 추가/멀티미디어 가시성 보강 + 제품 상세 페이지 보강/제품 카탈로그 보강.
- **온사이트 기술 최적화 (3개 카드)**: robots.txt로 차단된 트래픽/목차 + "콘텐츠 가시성 회복"(유일하게 확장, 영향 URL 9개/예상 증가율 +5.9x 직접 노출).
- **오프사이트 최적화 (4개 카드)**: Reddit 감성 분석/YouTube 감성 분석/위키피디아 분석/인용 감성 분석 — 각각 Opportunity Detail 템플릿 A~E와 연결되는 것으로 추정.

### 확인사항

- **13개 카드 → 6개 템플릿(A/B/C/D-1/D-2/E) 매핑**이 명시되어 있지 않음 — 각 카드의 목적지 확인 필요.
- "목차(Table of Content)" 카드만 명사구가 아닌 기능명처럼 보여 실제 최적화 대상 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → SearchBar → FilterTabs(온사이트/오프사이트) → OnsiteContentSection(6) → OnsiteTechnicalSection(3) → OffsiteSection(4).
2. **데이터 모델 확장**: `opportunities.opportunity_type`을 `onsite_content|onsite_technical|offsite`로 확장, `category`/`detail_template`(A/B/C/D-1/D-2/E) 컬럼 추가로 "상세" 라우팅 매핑.
3. **API**: `GET /opportunities?scope=&category=&search=`, `GET /opportunities/{id}` (opportunity_type/detail_template로 6종 템플릿 컴포넌트 중 하나 렌더링).

---

## 14. 기회 상세 - Template A (Standard)

### Description

- **헤더**: 뒤로가기+제목+URL 수/이슈 수 배지+카테고리+최종 업데이트일.
- **개요 섹션**: 가독성 문제 진단(Flesch Reading Ease 기준).
- **가이드 섹션 (접기/펼치기)**: 엣지 기반 최적화 솔루션 — 봇 트래픽에만 적용, CMS/코드 변경 없음, 3단계 권장사항.
- **기회 실행 계획**: "최적화 배포" 버튼(선택된 제안 없으면 비활성).
- **URL별 제안 카드 3개 (반복 패턴)**: 각각 3개 탭(현재 제안/수정 완료/무시됨) + 상태별 액션 버튼(수정 완료로 표시+제안 무시 / 롤백 / 무시 취소) + URL/이슈/에이전틱 트래픽(4주) 테이블.

### 확인사항

- 3개 URL 제안 카드가 상태별 예시 스냅샷인지 실제로 값이 동일한 데이터인지 판별 어려움.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → OpportunityHeader → OverviewCard → GuidanceCard → OpportunityPlanCard → SuggestionCard×N.
2. **데이터 모델 확장**: `fix_suggestions`(id, opportunity_id FK, url, issue_description, status: current|fixed|ignored, agentic_traffic_4w) 신규 테이블.
3. **"최적화 배포" 동작**: 엣지(CDN) 규칙 push 비동기 작업. 배포 성공/실패 토스트 피드백 필요(현재 없음).
4. **⚠️ 테이블 헤더 셀 배경 버그 수정 완료**: 각 셀이 개별 불투명 흰색 배경을 가져 헤더 행 전체가 줄무늬처럼 보이던 문제 발견·수정(9개 노드). 추가로 "Section Card"류 서브요소(Card Header/Body/Tabs/Plan Row/Table Box, 13개 노드)도 동일 계열 버그로 발견·제거. 구현 시 서브 컴포넌트는 배경 투명 유지, 배경색은 최상위 컨테이너 1곳에서만 관리.

---

## 15. 기회 상세 - Template B (Technical Diagnostic)

### Description

- **헤더**: 뒤로가기+제목(robots.txt로 차단된 트래픽)+부제+요약("URL 1개, AI 에이전트 3개 영향")+통계 배지 2개.
- **robots.txt 코드 뷰어**: 줄 번호와 함께 원문 렌더링(Roboto Mono). AI 에이전트 차단 Disallow 라인(9/11/13번)은 분홍 하이라이트.
- **에이전트별 차단된 트래픽 상세 테이블**: GPTBot/OAI-SearchBot/OAI-User 3개 에이전트별 URL/규칙.

### 확인사항

- 차단 지시어(분홍) 클릭 시 나타날 팝오버/모달 UI가 와이어프레임에 없음.
- Template A와 달리 "수정 배포" 같은 액션이 없음 — robots.txt는 읽기 전용(진단만) 설계인지 확인 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → DiagnosticHeader → RobotsTxtCodeViewer → BlockedTrafficTable.
2. **데이터 소스**: robots.txt 주기적 fetch+파싱 → `agentic_traffic_logs`와 대조해 차단 여부 계산. `robots_txt_snapshots`(id, domain_id, raw_content, fetched_at) 신규 테이블(변경 이력 추적).
3. **하이라이트 로직**: ai.robots.txt 목록 기준 AI 에이전트에 해당하는 Disallow 라인만 하이라이트+클릭 가능. `User-agent: *`는 대상 아님.

---

## 16. 기회 상세 - Template C (Content Recovery)

### Description

- **헤더**: URL 수(9)/예상 콘텐츠 증가율(+5.9x)/평균 콘텐츠 가시성(22%) — Opportunities 화면에서 유일하게 확장 노출됐던 카드와 동일 지표.
- **개요+가이드**: AI 에이전트가 JS를 실행하지 않아 동적 콘텐츠를 못 읽는 문제. "페이지 선택→최적화→측정→결과 확인" 4단계.
- **기회 실행 계획 + 최적화 진행률**: "Optimize on Edge" + 진행률 바("50개 URL 중 0개 최적화") + ⚠️ **업그레이드 유도/영업 문의 CTA** — 이 템플릿에서만 등장.
- **제안이 있는 URL 섹션**: 탭 3종 + 전체 도메인 URL 테이블. 각 행에 "미리보기"+"상세" 2개 버튼(다른 템플릿엔 "미리보기" 없음).

### 확인사항

- "미리보기" 버튼 동작 불명확(최적화 전/후 비교로 추정).
- ⚠️ **"업그레이드"/영업 문의 CTA와 요금제 연계** — 제품에 플랜 개념이 있는지, URL 최적화 제한이 걸리는 플랜이 무엇인지 확인 필요(다른 템플릿엔 이런 제한 없음).

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → Header(배지 3) → OverviewCard → GuidanceCard(4단계) → OpportunityPlanCard(진행률+업그레이드 CTA) → SuggestionsSection.
2. **요금제/사용량 제한 모델 (신규 설계 필요)**: `organizations.plan_tier`(free/pro/enterprise), `url_optimization_limit` 컬럼 추가 필요.
3. **API**: `GET /opportunities/{id}/detail`, `/urls?tab=`, `/optimization-progress`, `POST /urls/{urlId}/preview`.

---

## 17. 기회 상세 - Template D-1 (Sentiment, Single-Dimension)

### Description

- **헤더**: 카테고리(소셜 및 커뮤니티·소셜 미디어) + 통계 4개(분석된 게시물 16/댓글 1,487/브랜드 언급 221/전체 감성).
- **제안 테이블**: 3개 제안, 우선순위(긴급/높음/중간)+"액션 5개 보기"+근거 — URL이 아니라 "Reddit 평판 개선 제안" 단위.
- **마켓 지형도 + 마켓 트래킹**: 최대 5개 경쟁 브랜드(Flowmatic/Sendlytics/PulseCRM/AdRadar/TrueReach) — Brand Presence와 동일 UI 패턴.
- **감성 분석**: 우호적 56.3%/중립 12.5%/비우호적 31.3%.
- **스레드 테이블**, **토픽 테이블**(구독 개인화/가격 대비 가치/플랜 비교/데이터 프라이버시/해지 마찰 등 SaaS 특성 반영).

### 확인사항

- "액션 5개 보기" 클릭 시 표시 위치(행 확장/모달) 불명확.
- 제안-토픽-스레드 3개 테이블 간 데이터 연결 관계 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → Header(통계 4) → SuggestionsTable → MarketLandscapeChart → MarketTrackingSection → SentimentSummary → ThreadsTable → TopicsTable.
2. **데이터 모델 확장 (Reddit 전용)**: `reddit_posts`(subreddit, title, url, sentiment, brand_mention_count, share_of_voice), `reddit_topics` 신규 테이블 — 온사이트 mentions/citations와 별개 파이프라인(Reddit API/스크래핑 배치).
3. **API**: `GET /opportunities/{id}/reddit-summary`, `/suggestions?tab=`, `/reddit-threads`, `/reddit-topics`, `/market-tracking?competitors[]=`.

---

## 18. 기회 상세 - Template D-2 (Sentiment, Dual-Dimension)

### Description

- **헤더**: 통계 6개(D-1의 2배) — 분석된 영상 14/댓글 287/브랜드 언급(영상 184·댓글 155)/전체 감성(영상·댓글 각각) — **영상+댓글 2차원 병렬 추적**이 핵심 차이.
- **제안 테이블**: 2개 제안(경쟁사 비교 대응/가치 인식 내러티브 개선).
- **마켓 지형도**: "영상 내 언급"+"댓글 내 언급" 2개 차트로 분리.
- **마켓 트래킹**: Braze/Klaviyo/HubSpot/Marketo/Customer.io 비교.
- **감성 분석**: 영상/댓글 각각 3분류(둘 다 비우호적이 최다).
- **영상/댓글 탭 + 영상 테이블**(현재 "영상" 탭만 캡처됨), **토픽 테이블**(가격 및 가치 인식/경쟁 포지셔닝/제품 품질 및 사용성/구독 유연성).

### 확인사항

- ⚠️ **"댓글" 탭 콘텐츠 미확인** — 컬럼 구성 등 스펙 불명.
- D-1(Reddit)/D-2(YouTube) 템플릿 분기가 소스 채널 특성에 따른 고정 규칙인지, 확장 가능한 구조인지 확인 필요.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → Header(통계 6) → SuggestionsTable → MarketLandscapeChart(2열) → MarketTrackingSection → SentimentSummary(2블록) → VideoCommentTabs → VideosTable → TopicsTable.
2. **컴포넌트 재사용 전략**: D-1과 D-2는 통계 개수(4 vs 6)와 소스 차원 개수(1 vs 2)만 다름 — `dimensions: ['thread']` vs `['video','comment']` prop을 받는 **단일 SentimentAnalysisTemplate 컴포넌트**로 통합 구현 권장(별도 컴포넌트 X).
3. **데이터 모델 확장 (YouTube 전용)**: `youtube_videos`(video_title, channel_name, sentiment, share_of_voice, top_brand), `youtube_comments`(video_id FK, sentiment) 신규 테이블.

---

## 19. 기회 상세 - Template E (Article Analysis)

### Description

- **헤더**: "PDF로 내보내기" 버튼(이 템플릿 유일) + 통계 5개(참고문헌/섹션/단어 수/이미지/카테고리, 각각 평균 대비 증감).
- **개요 + "다음에서 가시성 개선" 플랫폼 배지 7개**: ChatGPT(유료/무료)/Google AI Overview/Perplexity/Google AI Mode/Copilot/Gemini — 대상 플랫폼을 명시하는 유일한 템플릿.
- **가이드 섹션 (AI 생성 배지)**: 위키피디아 페이지 외부 링크 + 권장 사항/핵심 인사이트/근거.
- **전략 추천 섹션**: "우선순위 산정 방식" 도움말 링크 → **Modal / Priority Explanation**(신규 제작, 실제 제품 스크린샷 기반: CRITICAL/HIGH/MEDIUM/LOW/INFORMATIONAL 5단계 표). 제안 2건(표 형태) + 정보성 항목 4개(실행 불가, 현황 표시용).
- **마켓 비교 테이블 + 시각적 비교 차트**: Neodigm vs 경쟁사 3곳(Growthstream/Marketify/Convertly).
- **문서 상세/구조/참고문헌 품질/인포박스 데이터**: 8개 섹션 구조(역사/제품/제품 디자인/회사/데이터 프라이버시/지사 위치/평가/같이 보기), 12개 필드 인포박스.

### 확인사항

- "AI 생성" 배지가 위키피디아 분석 전체를 의미하는지, 특정 텍스트만인지 범위 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → Header(PDF+통계 5) → OverviewCard(플랫폼 배지 7) → GuidanceCard → StrategicRecommendationsTable → MarketComparisonTable → VisualComparisonCharts → ArticleDetailsCard 등.
2. **데이터 모델 (Wikipedia 전용)**: `wikipedia_snapshots`(is_own boolean으로 자사+경쟁사 통합, reference_count/section_count/word_count/...), `wikipedia_infobox_fields`(EAV 패턴), `wikipedia_reference_quality`.
3. **PDF 내보내기**: 서버사이드 렌더링(헤드리스 브라우저) 권장, 전용 엔드포인트 `POST /opportunities/{id}/export-pdf`.

---

## 20. 기회 워크스페이스 (Opportunity Workspace)

### Description

- **필터바(전략 상태/기회 상태) + 통계 카드 3개**: 전체 전략(1)/완료·미추적(0)/완료·추적됨(0) — "전략"(여러 기회를 묶은 실험) 단위 집계.
- **전략 목록**: "+ 전략 생성"(Modal / Create Strategy) + 전략 카드(상태 배지+"성과 보기 →"+생성일/URL·프롬프트 개수/플랫폼/목표/완료일).
- **핵심 성과 + 최적화 프로세스**: 인용률 25%→43%(+72%) + 4단계 타임라인(베이스라인 수집→엣지 배포→임팩트 측정→실험 완료).
- **Modal / Create Strategy**: 1단계 "전략 상세"만 존재(전략 이름/설명/플랫폼/URL/토픽/프롬프트/목표). 2단계 "기회 추가"는 미구현.
- **Modal / View Performace**: "성과 보기 →"의 실제 목적지 — 목표/생성일/완료일/플랫폼 메타 + 성과 요약 + 인용률 추이 차트 + 프롬프트 성과 + 상위 URL 성과 테이블(9개) + 새로 인용된 URL 섹션.
- **Modal / Move Brand to Pending Confirmation**(Brand Detail 화면과 연동): active→pending 수동 전환.

### 확인사항

- ⚠️ **Create Strategy 2단계("기회 추가") 화면 부재** — 스텝 인디케이터만 있고 실제 화면 없음.
- 전략과 기회(Opportunity)의 1:1 여부 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → FilterBar → StatCards(3) → StrategyList → StrategyCard(완료 시 KeyOutcomes+OptimizationProcess 확장) → CreateStrategyModal.
2. **데이터 모델 확장**: `strategies`(name, description, platform, goal, status), `strategy_opportunities`(다대다), `strategy_urls`/`strategy_prompts`, `strategy_outcomes`(metric_name, before/after_value).
3. **API**: `GET /strategies?strategyStatus=&opportunityStatus=`, `POST /strategies`, `GET /strategies/{id}/outcomes`, `POST /brands/{brandId}/move-to-pending`.
4. **레이어명 오탈자**: 원본 Figma 레이어 "Modal / View Performace" → 실제 코드에서는 "Performance"로 정확히 명명할 것.

---

## 21. 브랜드 관리 (Brands Management)

### Description

- **활성 브랜드 섹션 (1개)**: Neodigm 카드 — URL/별칭/기타 브랜드/CDN/GSC/Analytics 연동 상태.
- **대기 중인 브랜드 섹션 (2개)**: Growth Collective/Peak Marketing — CDN/GSC/Analytics 상태 표시 없음.
- **카테고리 섹션 (3개)**: 마케팅(69)/자동화 툴(30)/광고(5) — 조직 전체 공유, 출처·수정·생성 메타 "—"(시스템 기본 제공 추정).
- **카테고리 관리 모달 3종**: Create/Edit(사용 중 프롬프트 N개에 경고)/Delete Category.
- **Modal / Add a Brand — 4단계 마법사**: 기본 정보→URL→상세 정보→검토.
- **입력값 및 검증 규칙**: 브랜드 이름(필수, 조직 내 중복 불가 추정)/마켓(필수, 최소 1개)/URL(필수, 온보딩 서브플로우)/로고(선택, 포맷·용량 미정)/카테고리명(중복 검사 여부 미정) 등.

### 확인사항

- ✅ **[해결됨]** "대기 중" 브랜드 승인 플로우 — Add a Brand 검토 화면에서 도메인 온보딩 완료 시 자동 전환됨을 확인(Brand Detail의 active→pending 수동 전환과 합쳐 양방향 전환 로직 완전 확정).
- 카테고리 삭제 시 연결된 프롬프트의 `category_id` 처리 방식(null 처리 vs "미분류" 자동 이동) 불명확.
- Add a Brand 폼 필드 세부 제약(설명 글자 수, 산업 자유 입력 허용 여부, 로고 업로드 포맷/용량, 가시성 우선순위 옵션 목록, URL 정규식, 카테고리명 중복 검사) 다수 미정.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → ActiveBrandsSection → PendingBrandsSection → CategoriesSection.
2. **데이터 모델 확장**: `brands.status`(active|pending), `cdn_connected`/`gsc_connected`/`analytics_connected`(boolean) 컬럼 추가. `categories` 신규 테이블(prompt_count, origin: system|user).
3. **API**: `GET /brands?status=`, `GET /categories`, `POST/PUT/DELETE /categories/{id}`, Add a Brand 4단계 제출 엔드포인트.

---

## 22. 브랜드 상세 (Brand Detail)

### Description

- **헤더**: 브랜드명+기본 URL + "연결 관리"/"변경사항 저장"/"대기 상태로 전환"(Modal / Move Brand to Pending Confirmation) 3개 액션.
- **브랜드 편집 폼**: 이름(필수)/기본 URL(읽기 전용 추정)/설명/업종/마켓 — Add a Brand 1단계와 동일 필드 재사용.
- **브랜드 URL/소셜/획득 콘텐츠 소스/브랜드 별칭 4개 섹션**: 동일 패턴(설명+추가 버튼+빈 상태). URL 섹션만 기본 URL 1개 이미 존재.
- **추적할 기타 브랜드 섹션**: CSV 업로드(대량) + 개별 추가.
- **Modal / Move Brand to Pending Confirmation**: 영향받는 활성 프롬프트 104개 표시 + 필수 체크박스.
- **5개 추가 모달 입력값 규칙**: Add Other Brand/Add Alias/Add URL/Add Social Account/Add Earned Content Source — 대부분 필드 1~2개(필수)+마켓 멀티 태그.

### 확인사항

- 체크박스("영향을 이해했습니다")가 "대기 상태로 전환" 버튼 활성화를 게이팅하는지 불명확.
- 헤더의 읽기 전용 "기본 URL"과 "브랜드 URL" 섹션의 동기화 방식 불명확.
- Add Social Account의 플랫폼 자동 감지 여부(URL 패턴 기반 추정) 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → Header → EditBrandForm → 4개 섹션 → OtherBrandsSection → MoveToPendingModal.
2. **✅ active ↔ pending 양방향 전환 완전 확정**: pending→active는 도메인 온보딩 완료로 자동, active→pending은 이 화면의 버튼으로 수동. 전환 시 연결된 `prompt_runs` 일시 중지 필요.
3. **API**: `GET/PUT /brands/{brandId}`, `POST /brands/{brandId}/{urls|aliases|earned-content-sources|social-accounts|competitors}`, `POST /brands/{brandId}/move-to-pending`(실행 중 prompt_runs를 paused로 일괄 전환).

---

## 23. 연결 관리 (Manage Connections: CDN / GSC / Commerce)

### Description

- **공통 레이아웃**: "Neodigm으로 돌아가기" + URL 선택 드롭다운 + 3개 탭(CDN 설정/Google Search Console/커머스).
- **CDN 설정 탭 — 3단계 점진적 활성화**: 1) 기회 잠금 해제(공개 페이지 스캔) → 2) AI 트래픽 인사이트 활성화(Modal / Onboard CDN Provider) → 3) AI 에이전트에 최적화 배포(2단계 완료 전 🔒 잠김).
- **GSC 탭**: "연결됨" 상태만 존재("계정 관리" 버튼), 최초 연결 플로우 없음.
- **커머스 탭**: Adobe Commerce 스토어 뷰 설정, 6개 필드 모두 필수(스토어 뷰 URL/환경 ID/웹사이트 코드/스토어 코드/스토어 뷰 코드/호스트 이름) + 카탈로그 필드 제한(제품명/설명 최대 글자 수).
- **Modal / Onboard CDN Provider**: Adobe 관리형 4종+BYOCDN 6종+기타, 지원팀 이메일(`support@neodigm.com`) 안내.

### 확인사항

- GSC 최초 연결(OAuth) 플로우 UI 없음.
- "기타(Other)" CDN 선택 시 추가 입력 필드 등장 여부 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → BackLink → UrlSelector → Tabs → (CdnConfigPanel | GscPanel | CommercePanel) → OnboardCdnProviderModal.
2. **데이터 모델**: `connections`(brand_url_id FK, type: cdn|gsc|commerce, status, provider, config JSON) 신규 테이블. CDN 3단계는 별도 boolean 3개(`scan_enabled`, `traffic_insights_enabled`, `agent_deploy_enabled`) 필요.
3. **커머스 폼 검증**: 6개 필드 모두 필수, URL 형식 검증(예: `https://brand.com/fr/`), 나머지는 Adobe Commerce 고유 식별자 형식(정규식 확정 필요).
4. **CDN 3단계 활성화**: 순차 잠금 해제(프론트+백엔드 양쪽 검증), 2단계는 CDN 로그 포워딩 확인 후 자동으로 3단계 잠금 해제.

---

## 24. 도움말 및 학습 (Help & Learning)

### Description

- **헤더 + 카드 2개**: "문서"(기능 설명/모범 사례) / "지원"(도움 요청/문제 신고/팀 문의). GNB 최하단 진입점.

### 확인사항

- 카드 클릭 시 외부 링크인지 앱 내부 화면인지 불명확.

### 개발 가이드

1. **페이지 구성**: TopBar → Sidebar → PageHeader → CardGrid(2개 카드).
2. **구현 범위**: 정적 콘텐츠, 별도 API 불필요. 외부 링크(문서 사이트/헬프데스크) 앵커로 구현 권장. 내부 호스팅 시 CMS 연동 별도 스코프.

---

## 25. DB 스키마 (Postgres) — 한국형 LLMO

전체 화면을 관통하는 공통 Postgres 스키마 설계 문서(`646:29268`, Korean 페이지에 별도 프레임으로 존재)입니다. 핵심 테이블 15종:

1. **organizations** — 조직/고객사(멀티테넌시 스코프).
2. **brands** — 브랜드(자사/경쟁사 구분, `is_own_brand`).
3. **domains** — 브랜드에 연결된 도메인.
4. **markets** — 마켓/국가(worldwide 여부 포함).
5. **llm_models** — LLM 모델(provider-agnostic, 추후 Naver 등 국내 LLM 추가 대비).
6. **topics** — 토픽(검색량/난이도).
7. **prompts** — 프롬프트(topic/market FK).
8. **prompt_runs** — 프롬프트 실행 기록(주간 배치).
9. **mentions** — 브랜드 언급(가시성 점수 공식의 Mentions/Position/Sentiment 원천).
10. **citations** — 인용(Citations 원천, `is_own_domain`으로 자사/제3자 구분).
11. **visibility_scores** — 가시성 점수 집계 캐시(35% Mentions + 15% Citations + 30% Position + 20% Sentiment 주간 배치).
12. **tracked_items** — Track 버튼으로 추가된 항목(`status: pending_confirmation`).
13. **agentic_traffic_logs** — 에이전틱 트래픽 로그(ai.robots.txt 매칭).
14. **referral_traffic_events** — 레퍼럴 트래픽 이벤트(휴먼 vs 봇 분리).
15. **opportunities** — 기회 캐시 테이블.

각 화면 개발 가이드에서 제안된 **확장 테이블**: `claim_clusters`/`claim_evidence`(Brand Claims), `crawler_hits`(URL Inspector), `robots_txt_snapshots`(Template B), `fix_suggestions`(Template A), `reddit_posts`/`reddit_topics`(Template D-1), `youtube_videos`/`youtube_comments`(Template D-2), `wikipedia_snapshots`/`wikipedia_infobox_fields`/`wikipedia_reference_quality`(Template E), `strategies`/`strategy_opportunities`/`strategy_outcomes`(Opportunity Workspace), `categories`(Brands Management), `connections`(Manage Connections).

**확인사항**: 국내(Naver) LLM 연동 시 스키마 확장 범위(응답 포맷 차이로 파싱 로직 분기 필요 가능성), sentiment 산출 방식(재질의 vs 별도 감성분석 모델) 미정, `agentic_traffic_logs` 매칭 정확도(ai.robots.txt 커뮤니티 목록의 누락 가능성).

---

## 26. 레이아웃/모달 감사 요약

프레임 배치 및 모달/토스트 완전성에 대한 전체 페이지 시스템 감사 결과입니다.

### 발견 및 수정한 문제

- **구조적 버그**: Opportunity Detail Template A의 URL 제안 카드 3개 중 2개가 auto-layout에서 이탈해 화면 밖에 고아 상태로 떠 있던 문제 — 재결합 완료(화면 높이 1327→1981px 정상 복구).
- **누락된 모달 발견**: `Modal / Add Earned Content Source`가 번역 대상에서 누락되어 있었음 — 발견 후 번역 완료.
- **중복 스텁 제거**: 빈 "Visibility Overview - Description" 템플릿 복제본(콘텐츠 없이 제목만 3개) 삭제.
- **반복되는 흰색 배경 버그**: 테이블 헤더 셀 및 "Card Header/Body/Tabs/Plan Row/Table Box" 등 서브 컴포넌트가 자체 불투명 흰색(#FFFFFF) 배경을 가져 부모 컨테이너 배경(연한 회색/라벤더)을 가리는 문제를 다수 화면에서 반복 발견·수정.

### 확인 완료, 조치 불필요

- 전체 110개 최상위 프레임 간 **바운딩 박스 겹침 0건** — 화면/모달/Description 패널의 공간 배치는 전반적으로 깨끗함(화면 → 해당 모달 → Description 패널이 우측으로 순차 오프셋되는 일관된 컨벤션).
- Template A 외 다른 화면에서는 유사한 고아 콘텐츠 사례 없음.

### 여전히 열려 있는 항목

- **누락된 토스트 1건**: Prompt Research용 `Toast / Export`(구 `646:12926`)가 세션 중 사라짐 — 원인 불명, Market Comparison의 템플릿형 토스트로 대체 가능할 것으로 추정.
- **시스템적 토스트 공백**: 배포/저장/브랜드 생성/CDN 온보딩/카테고리 CRUD/대기 상태 전환 등 대부분의 비-Export 액션에 성공/실패 토스트가 전혀 없음 — 실제 구현 시 신규 설계 필요.
- **Brand Claims BACKUP(pre-redesign) 프레임**: 84개 텍스트 노드, 번역 여부 사용자 결정 대기 중.

---

_문서 생성: Figma 파일 "Neodio" Korean 페이지의 Description/확인사항/개발가이드 패널 전체를 종합. 각 항목의 원본 위치(Figma node ID)는 본 문서 대신 Figma 파일에서 직접 확인 가능합니다._
