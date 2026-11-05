# 01. PROJECT_OVERVIEW — danishashko/geo-aeo-tracker

> 분석 문서(원본 참조 포함). 독립 설계 문서(05)로 원본 표현을 옮기지 않는다.
> 분석 방식: **동일 세션 분석**이다. Source Analyst와 Product Architect가 같은 세션에서 같은 에이전트로 수행했으므로 엄격한 Clean-Room이 아니다(한계는 06 문서 §4).

## 기본 정보

| 항목 | 내용 |
|---|---|
| URL | https://github.com/danishashko/geo-aeo-tracker |
| 분석 Commit | `4858dece72116189be563ae90371aefb8763fbee` (2026-10-19, "docs: drop Profound and Otterly from README comparison") |
| 분석 방식 | `git clone --depth 1`, 읽기 전용. 의존성 설치·스크립트 실행·테스트 실행 **없음** |
| 버전 | package.json `llm-tracker` 1.6.0 ([package.json](https://github.com/danishashko/geo-aeo-tracker/blob/4858dec/package.json)) |
| 라이선스 | MIT, Copyright (c) 2026 Daniel Shashko (`LICENSE`) |
| 의존성 라이선스 | **미검증** (license-checker 미실행. 직접 의존성 9개: `@google/genai`, `@supabase/supabase-js`, `idb-keyval`, `next`, `react`, `react-dom`, `recharts`, `zod`, + dev 도구) |
| 규모 | 추적 파일 104개, `lib/`+`app/api/` TS 약 8.9k줄, 테스트 파일 16개 |
| 언어/프레임워크 | TypeScript, Next.js 16, React 19, Tailwind 4, Recharts, zod |

## 목적과 핵심 기능

"셀프호스팅 AI 가시성 트래커". 브라우저에 상태를 저장하고(IndexedDB), 선택적으로 자기 Supabase에 동기화한다. 한 번의 실행(run)은 프롬프트 × 엔진 조합이다.

- 5개 엔진 수집(ChatGPT, Perplexity, Gemini, Copilot, Google AI Mode) — **Bright Data AI Scraper API**에 위탁
- 0–100 가시성 점수, 감성, 인용 도메인 집계, 드리프트 알림, 국가별 실행
- 경쟁사 배틀카드, 인용 기회, 니치 탐색, 페르소나 팬아웃(LLM 생성)
- AEO 사이트 감사(llms.txt, AI 크롤러 robots 접근, 스키마, BLUF 밀도)
- SRO 분석 파이프라인(교차 플랫폼 인용 → SERP → 페이지 스크래핑 → 사이트 컨텍스트 → LLM 분석)
- **Rank Signal**: 문단의 특정 텍스트 특징이 LLM 선택에 영향을 주는지 쌍대 A/B로 검증(DEJAN AI 방식을 참조했다고 README에 명시)

## 외부 서비스

Bright Data(스크래퍼·SERP·Web Unlocker), OpenRouter(분석·판정·재작성 LLM), Google Gemini(grounding), Supabase(선택 저장소), Vercel(배포).

## 운영 상태

- 활발히 갱신 중(분석 시점 하루 전 커밋). 릴리스/태그 상태는 **미확인**.
- 공개 데모 배포(`isDemoDeploy`)는 유료 API 라우트를 막는 모드가 있다.

## 상용 SaaS 적용 시 위험 요소 (요약)

1. 수집이 전적으로 제3자(Bright Data)의 AI 챗봇 스크래핑에 의존 → 약관·가격·차단 위험 (06 문서)
2. 멀티테넌트·계정·권한 개념이 없음(단일 공유 비밀번호)
3. 스케줄링이 브라우저 열림에 의존
4. 점수 규칙이 단순 가산식이라 비교·해석 신뢰도 낮음
