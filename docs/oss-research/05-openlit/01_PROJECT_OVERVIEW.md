# 01. PROJECT_OVERVIEW — openlit/openlit

> 분석 문서(원본 참조 포함). 독립 설계(05)로 원본 표현을 옮기지 않는다. 동일 세션 분석이라 엄격한 Clean-Room이 아니다(06 §4).

## 기본 정보

| 항목 | 내용 |
|---|---|
| URL | https://github.com/openlit/openlit |
| 분석 Commit | `5edb5450efa6be8cd4270cac3efa00985bf82302` (2026-11-03, "feat: Microsoft and Okta sign-in with instance admin area (#1896)") |
| 분석 방식 | `git clone --depth 1`, 읽기 전용, 정적 읽기만. **설치·실행·테스트 없음.** 중간에 외부 JSON을 인라인 파이썬으로 파싱하려던 명령이 권한 분류기에 거부되어 이후 `head`/`grep`/`sed` 읽기로만 진행 |
| 라이선스 | **Apache-2.0** (루트·`sdk/python`·`sdk/typescript`의 `LICENSE`) |
| 에디션 구조 | 이 저장소는 **CE/OSS**. `AGENTS.md`가 "엔터프라이즈 구현(RBAC 정책, 감사, 과금, 라이선스, 좌석)은 비공개 저장소에 있고 CE에 두지 않는다"고 명시. CE에는 중립 확장 훅과 no-op 대체만 존재 → 상업 코드는 **이 트리에 없다**(저장소 자체 문서 기준, 독립 확인은 불가) |
| 서드파티 | OpenCode 로고 도형 일부(MIT, `THIRD_PARTY_NOTICES.md`) |
| 규모 | 추적 파일 약 3,334개, 테스트 성격 파일 약 618개 |
| 스택 | Python·TypeScript·Go SDK, Next.js UI(`src/client`), Go 서비스(`engine`, `otlp-receiver`, `opamp-server`), Go 컨트롤러(eBPF), ClickHouse(분석 저장), Prisma(설정), Docker Compose |

## 목적과 핵심 기능

"에이전트 하니스 엔지니어링 플랫폼": **OpenTelemetry 네이티브** 로 LLM/에이전트 호출을 추적하고, 평가·가드레일·프롬프트/컨텍스트 관리·비용/GPU 모니터링을 제공한다. GEO 도구가 아니다.

| 영역 | 내용 |
|---|---|
| 관측 | SDK 한 줄 초기화로 60+ 제공자/프레임워크/벡터 DB 자동 계측, OTLP 내보내기 |
| 평가 | 서버측 LLM-as-judge(온라인 자동 샘플링 + 오프라인 API), 규칙 엔진으로 평가 컨텍스트 선택 |
| 가드레일 | 프롬프트 인젝션·민감 주제·주제 제한·PII·모더레이션·사용자 정의 가드 파이프라인(SDK) |
| 운영 | 프롬프트 허브, 컨텍스트, 규칙 엔진, 금고(Vault), 비용 추적(JSON 가격 파일), 알림, GPU 수집기 |
| 제로코드 | eBPF 컨트롤러가 LLM 엔드포인트로 접속하는 프로세스를 발견하고 계측 |
| 코딩 에이전트 | Claude Code·Codex·Cursor·OpenCode 플러그인, 거버넌스/정책 팩 |

## Neodio와의 관계

직접 경쟁이 아니다. 관측 플랫폼이므로 대부분은 범위 밖이고, **가드 파이프라인 설계**와 **"컨텍스트를 정답으로 두는" 평가 방식**, **OTel GenAI 속성 명명**이 참고 대상이다.

## 상용 SaaS 적용 시 위험 요소

1. 코드 이식은 Apache-2.0이라 법적으로는 가능하나 정책상 금지(스택·언어·무게도 부적합).
2. 가드레일 SDK의 기본값이 **fail-open**(가드 오류 시 통과) — Neodio의 정확도·안전 우선 원칙과 충돌 가능.
3. 가격 데이터가 단일 JSON 자산 — 이력·조건 티어 개념이 약함(전체 구조는 일부만 확인).
