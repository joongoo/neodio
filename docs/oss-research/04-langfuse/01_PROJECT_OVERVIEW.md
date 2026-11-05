# 01. PROJECT_OVERVIEW — langfuse/langfuse

> 분석 문서(원본 참조 포함). 독립 설계(05)로 원본 표현을 옮기지 않는다. 동일 세션 분석이라 엄격한 Clean-Room이 아니다(06 §4).

## 기본 정보

| 항목 | 내용 |
|---|---|
| URL | https://github.com/langfuse/langfuse |
| 분석 Commit | `728e69371ec7667e24602c2b1d87a8c60cfc6404` (2026-11-04, "fix(ci): don't check licenses for optional pkgs") |
| 분석 방식 | `git clone --depth 1`, 읽기 전용. 설치·실행·테스트 **없음** |
| 버전 | 루트 `package.json` 4.75.0 |
| 라이선스 | **오픈 코어(이중 구조)**. 루트 `LICENSE` = MIT(Copyright ClickHouse, Inc. 2023-2026). 단 `ee/`, `web/src/ee/`, `worker/src/ee/`, `packages/shared/src/server/ee/` 하위는 **별도 상업 라이선스**(`ee/LICENSE`) — 유효한 Langfuse Enterprise 계약 없이는 사용 불가 |
| 소유 | 2026-01부터 ClickHouse에 합류(README) |
| 규모 | 추적 파일 약 7,530개, 테스트 파일 약 813개, Prisma 마이그레이션 467개 |
| 스택 | TypeScript 모노레포(pnpm/turbo), Next.js 16 + tRPC(web), 별도 worker 서비스, BullMQ(Redis), PostgreSQL(Prisma), **ClickHouse**(분석), S3/MinIO(원본 이벤트·미디어), Vercel AI SDK |
| 배포 | Docker Compose(web, worker, clickhouse, minio, redis, postgres), Helm, Terraform(AWS/Azure/GCP) |

## 목적과 핵심 기능

"AI 엔지니어링 플랫폼": LLM 호출·에이전트의 **관측(트레이스)·평가·프롬프트 관리·데이터셋/실험·대시보드**. GEO 도구가 아니다.

| 영역 | 내용 (분석 범위) |
|---|---|
| 관측 | 트레이스/스팬/생성 이벤트 수집(API·OTel), 토큰·비용 계산 |
| 평가 | LLM-as-judge, 코드 평가, 결정 모델 평가, 사용자 피드백, 수동 라벨링(주석 큐) |
| 프롬프트 관리 | 버전·라벨·보호 라벨·의존성, 캐시 |
| 데이터셋/실험 | 데이터셋 항목 버전, 실행(run), 실험 큐 |
| 운영 | 조직/프로젝트/RBAC, API 키 범위, 감사 로그, 모니터(임계값 알림), 자동화(트리거→액션), 데이터 보존·삭제 |
| 기타(범위 밖) | AI 게이트웨이, 인앱 에이전트, 스킬 관리, 토픽 클러스터링 |

## Neodio와의 관계

직접 경쟁이 아니라 **플랫폼 공학 참고 자료**다. Neodio가 앞으로 필요로 하는 것(대량 수집의 내구성, LLM 평가의 거버넌스, 비용 단가 관리, 멀티테넌트 격리)을 이미 대규모로 운영하는 사례다.

## 상용 SaaS 적용 시 위험 요소

1. **`ee/` 영역은 상업 라이선스** — 어떤 형태로도 참조·이식 금지(06).
2. 시스템이 거대하고 인프라(ClickHouse, Redis, S3, Postgres)가 무겁다 — Neodio 현재 규모에 과함.
3. 코드 이식은 MIT여도 정책상 금지.
4. 분석 범위가 방대해 **정독한 부분이 일부**다(03 §0 참고).
