# 01. PROJECT_OVERVIEW — Arize-ai/phoenix

> 분석 문서(원본 참조 포함). 독립 설계(05)로 원본 표현을 옮기지 않는다. 동일 세션 분석이라 엄격한 Clean-Room이 아니다(06 §4).
> ⚠ **이 프로젝트는 6개 중 IP 위험이 가장 높다.** 라이선스가 오픈소스가 아니고(ELv2), 저장소가 특허 고지를 명시한다. 그래서 **구현 세부(ELv2 소스)는 의도적으로 읽지 않고** 공개 문서와 Apache-2.0 패키지의 인터페이스 수준만 분석했다.

## 기본 정보

| 항목 | 내용 |
|---|---|
| URL | https://github.com/Arize-ai/phoenix |
| 분석 Commit | `496dbdb12aa3cd830d41be87ec613db08491b428` (2026-11-04, "ci: drop pull_request triggers from the closed-only workflows (#17640)") |
| 분석 방식 | `git clone --depth 1`, 읽기 전용. 설치·실행·테스트 **없음** |
| 규모 | 추적 파일 약 8,940개, 테스트 관련 파일 약 1,355개 |
| 스택 | Python 서버(`src/phoenix`), TypeScript UI·패키지(`js/`), Python/TS SDK·evals·otel 패키지, Helm/Kustomize |

## 라이선스 (핵심)

| 영역 | 라이선스 |
|---|---|
| 루트 `LICENSE` (서버 등 대부분) | **Elastic License 2.0 (ELv2)** — 소스 공개이나 **오픈소스 라이선스가 아님** |
| `packages/phoenix-evals` (Python 평가 라이브러리) | ELv2 |
| `packages/phoenix-client`, `packages/phoenix-otel`, `js/packages/phoenix-evals` | Apache-2.0 |
| `IP_NOTICE` | "Arize AI, Inc. 저작권. **코드 일부는 미국 특허 11,315,043 및 11,615,345로 보호**되며, 보호 범위에는 코드 실행으로 가능해지는 기능, 장치, 시스템, 저장 매체 등이 포함되나 이에 한정되지 않음" |

ELv2 핵심 제한(원문 기준): ① **호스팅/관리형 서비스로 제3자에게 제공 금지**(실질적 기능 집합 접근 제공 시) ② 라이선스 키 기능 우회 금지 ③ 라이선스·저작권·고지 변경/삭제 금지 ④ 수정 시 수정 사실 고지, 사본 수령자에게 조건 전달. 특허 허여는 있으나 "수정·추가로 침해되는 청구항은 제외", 특허 소송 제기 시 종료.
문서(`docs/phoenix/self-hosting/license.mdx`)는 "자체 호스팅은 무료로 완전 허용, 기능 잠금 없음"이라고 안내.

## 목적과 핵심 기능

AI 관측·평가·실험 플랫폼: 트레이싱(OpenTelemetry), LLM 평가(LLM-as-judge/코드 평가), 버전 관리 데이터셋, 실험, 플레이그라운드, 프롬프트 관리, 내장 에이전트(PXI), 원격 MCP 서버. GEO 도구가 아니다.

## Neodio와의 관계

직접 구현을 참고할 수 없다. **공개 문서에서 드러나는 평가 방법론**(골든 데이터셋 → 판정기 벤치마크, 판정 앙상블, 판정 실행 추적, 버전 고정 데이터셋)이 프로젝트 2의 D4 골드셋 계획과 겹치므로, **일반 방법론 수준**에서만 흡수한다.

## 상용 SaaS 적용 시 위험 요소

1. ELv2: Neodio를 Phoenix 기반으로 하거나 그 기능을 고객에게 제공하면 **금지 가능성이 높다**. 내부 도구로만 쓰는 것도 범위를 법무가 확인해야 한다.
2. 특허 고지: 어떤 부분이 특허 대상인지 이 분석으로 알 수 없다. 구현 방식 모방은 위험.
3. 코드 이식: 금지(ELv2 파생 + 특허).
