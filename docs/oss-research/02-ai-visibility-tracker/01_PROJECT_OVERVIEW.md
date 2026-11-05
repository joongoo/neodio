# 01. PROJECT_OVERVIEW — Open-Source-SEO-Tools/ai-visibility-tracker

> 분석 문서(원본 참조 포함). 독립 설계(05)로 원본 표현을 옮기지 않는다. 동일 세션 분석이라 엄격한 Clean-Room이 아니다(06 §4).

## 기본 정보

| 항목 | 내용 |
|---|---|
| URL | https://github.com/Open-Source-SEO-Tools/ai-visibility-tracker |
| 분석 Commit | `fad7d133841173002cd6b1edd947e9f5ffca034a` (2026-09-12, "feat: GEO Visibility Tracker, initial public release") |
| 분석 방식 | `git clone --depth 1`, 읽기 전용. 설치·실행·테스트 **없음**. 얕은 복제라 커밋 이력은 **미확인** |
| 라이선스 | **GNU AGPL-3.0** (`LICENSE`), Copyright (C) 2026 Marc Moeller (`NOTICE`) |
| 출처 | NOTICE: 동일 저자의 상용 SEO+GEO 플랫폼 "Climby"(같은 AGPL-3.0)에서 "추출·변형"한 것 |
| 의존성 라이선스 | **미검증** |
| 규모 | 추적 파일 197개, 핵심 서비스 TS 약 6.2k줄(`rpc/router/geo.ts` 하나가 2,135줄) |
| 언어/스택 | TypeScript, Next.js(App Router), oRPC, Better Auth, BullMQ + Redis, PostgreSQL + Drizzle ORM, pnpm 모노레포, Docker Compose |
| 테스트 | 테스트 파일 **2개**(openrouter 21줄, 브랜드 폼 훅). 사실상 미비 |

## 목적과 핵심 기능

"에이전시·인하우스 마케터용 셀프호스팅 GEO 트래커". 프롬프트 묶음을 AI 엔진에 던져 **언급 / 인용 / 경쟁사 추천** 여부를 기록하고 Share-of-Voice와 GEO 점수를 낸다.

- 프롬프트 추적(의도 4종 × 브랜드 포함 여부 2축, "상업적 질의만" 스윕 모드)
- 스윕(수동 + 주 1회 자동), 인용 결과(출처 도메인·자사/경쟁사 구분)
- LLM 채점: 정확도·커버리지·감성·추천 여부·추천 순위·속성별 인정 여부·경쟁사 목록
- 경쟁사 비교, 주기별 SoV 스냅샷 시계열
- 사이트를 읽어 토픽·키워드·경쟁사를 제안하는 가이드 설정
- 지역 타깃팅(엔진별 지원 단위 차이 처리)

## 외부 서비스

OpenRouter(질의·채점·추출), DataForSEO(AI Mode/AIO, ChatGPT·Gemini·Perplexity 스크래핑 API, 선택), Redis, PostgreSQL.

## 운영 상태

초기 공개 릴리스(2026-09-12 기준). README는 citation-gap, 액션 아이템, 기사 생성, PDF/공유 링크 등을 "코어 빌드에 미포함"이라 적었지만, 트리에는 `services/geo/citation-gap.ts`(311줄)가 존재한다 → README와 코드의 불일치(실제 사용 여부 **미검증**).

## 상용 SaaS 적용 시 위험 요소 (요약)

1. **AGPL-3.0**: 코드를 가져오거나 파생하면 Neodio의 네트워크 서비스 소스 공개 의무 위험(06).
2. 테스트가 거의 없어 정확도 보증 수단이 없음.
3. 수집 일부를 DataForSEO(제3자 스크래핑 데이터)에 위탁.
4. 행정 단위 하드코딩 등 한국 시장 미대응.
