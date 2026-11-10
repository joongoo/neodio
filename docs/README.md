# Neodio 작업 시작 문서

| 항목 | 내용 |
| --- | --- |
| 용도 | 새 작업을 시작할 때 현재 구조, 기준 문서, 남은 일을 찾는 진입점 |
| 확인일 | 2026-11-10 (문서 구조와 코드 위치 확인) |
| 기준 | 현재 동작은 코드·운영 설정, 기능 결정은 아래 기준 문서 |
| 문서 규칙 | [공통 템플릿](template.md), 소문자 영문 `주제-문서유형.md` |

## 먼저 확인할 것

1. 작업 영역을 아래 표에서 고르고 **기준 문서 하나**를 읽습니다.
2. 문서의 `구현 현황`과 `후속 계획`을 구분하고, 연결된 코드에서 현재 상태를 다시 확인합니다. 문서 안의 날짜가 오래된 실행 결과는 현재 검증으로 취급하지 않습니다.
3. 작업 후 해당 기준 문서의 상태와 남은 일을 갱신합니다. 새 문서를 만들기 전 기존 기준 문서에 합칠 수 있는지 확인합니다.

## 기능과 기준 문서

| 영역 | 기준 문서 | 코드 진입점 | 현재 확인된 상태 |
| --- | --- | --- | --- |
| 제품 범위·화면 | [P0 범위](product/p0-scope-spec.md), [화면 명세](product/screen-spec.md) | [`src/app`](../src/app) | 초기 제품 범위와 Figma 화면 요구 기록. 실제 화면은 코드 확인 |
| DB·수집 파이프라인 | [데이터베이스](data/database-guide.md), [수집·가공](data/collection-pipeline-spec.md) | [`src/lib/backend/database`](../src/lib/backend/database), [`scripts`](../scripts) | Postgres 저장과 수집/가공 경로 구현. 소스별 계획은 구현과 구분 |
| 계정·조직 | [계정·조직·권한](features/access/access-and-organization-spec.md) | [`src/lib/backend/auth`](../src/lib/backend/auth), [`src/app`](../src/app) | 개인 계정, 조직 역할, 브랜드 접근 권한 구현. 로그인 강제는 `AUTH_ENABLED` 설정 확인 |
| 프롬프트·AIO | [프롬프트와 플랫폼](features/visibility/prompt-surfaces-spec.md) | [`src/lib/backend/aio`](../src/lib/backend/aio), [`src/lib/promptSurfaces.ts`](../src/lib/promptSurfaces.ts) | 프롬프트 통합 1~3단계와 AIO 결과의 `prompt_runs` 동시 적재 구현. 정리 단계 보류 |
| GSC·네이버 검색 | [GSC 연동](features/integrations/gsc-integration-spec.md), [네이버 데이터랩](features/integrations/naver-datalab-search-trend-spec.md) | [`src/lib/backend/gscSearchAnalyticsReader.ts`](../src/lib/backend/gscSearchAnalyticsReader.ts), [`src/lib/backend/naverDatalab.ts`](../src/lib/backend/naverDatalab.ts) | GSC OAuth·검색 성과 조회와 네이버 검색어 트렌드 경로 구현. 추가 신호는 항목별 상태 확인 |
| YouTube 인용 | [YouTube 추적](features/video/youtube-tracking-spec.md) | [`src/lib/backend/aio`](../src/lib/backend/aio), [`src/app`](../src/app) | AIO 인용 MVP와 영상 관리·프롬프트 등록 경로 구현. 초기 확장안의 남은 범위는 코드 대조 필요 |
| 에이전틱 트래픽 | [에이전틱 트래픽](features/traffic/agentic-traffic-spec.md) | [`src/lib/agentic`](../src/lib/agentic) | 분류 순수 함수·합성 테스트 구현. 로그 업로드 UI와 실로그 검증은 후속 |
| 리포트·개요 | [클라이언트 리포트](features/reporting/client-report-spec.md), [개요 체크리스트](features/reporting/overview-checklists-spec.md) | [`src/lib/report.ts`](../src/lib/report.ts), [`src/lib/db/data/overview.ts`](../src/lib/db/data/overview.ts) | 체크리스트와 리포트 생성·스냅샷·확정·브라우저 PDF 저장 구현. 공유·자동 발송은 미구현 |
| 운영 | [설치형 수집기](operations/collector-guide.md), [LLM API 수집](operations/llm-collection-guide.md), [프로덕션 점검](operations/production-readiness-checklist.md), [페이지 QA](operations/page-qa-checklist.md) | [`collector`](../collector), [`package.json`](../package.json) | 설치·수집·점검 절차. 과거 점검 결과는 재검증 필요 |

## 이어서 할 일

| 우선 확인할 작업 | 근거와 확인할 코드 |
| --- | --- |
| AIO 실제 수집으로 `prompt_runs` 동시 적재 확인, 과거 관측 백필 범위 결정 | [프롬프트와 플랫폼 §7](features/visibility/prompt-surfaces-spec.md), [`aio/collector.ts`](../src/lib/backend/aio/collector.ts) |
| YouTube AIO 집계를 `prompt_runs`로 옮길지 기존 집계와 비교 검증 | [프롬프트와 플랫폼 §7](features/visibility/prompt-surfaces-spec.md), [`aio/store.ts`](../src/lib/backend/aio/store.ts) |
| 에이전틱 트래픽의 실제 로그 골드셋 검증과 업로드 UI 범위 결정 | [에이전틱 트래픽 §16](features/traffic/agentic-traffic-spec.md#section-01), [`src/lib/agentic`](../src/lib/agentic) |
| 영상 관리에 이미 구현된 등록·프롬프트 경로를 확인하고 남은 추천·스케줄 범위 결정 | [YouTube 추적 후속 계획](features/video/youtube-tracking-spec.md#section-02) |
| 오픈소스 조사에서 선정한 골드셋 파일럿의 라벨링 진행 여부 확인 | [조사 종합 §03](research/oss-research/00-0-synthesis.md#section-03) |
| GSC refresh token의 DB 저장·백업·암호화 보완 여부 검토 | [GSC 현재 구현](features/integrations/gsc-integration-spec.md), [`gscTokenStore.ts`](../src/lib/backend/gscTokenStore.ts) |

위 항목은 문서에 남아 있는 후속 작업입니다. **착수 전 코드와 운영 데이터를 확인해 완료 여부를 다시 판정**하세요.

## 조사 자료

- [GEO 경쟁 제품 조사](research/geo-benchmark-research.md): 제품 관찰과 반영 판단.
- [오픈소스 조사 종합](research/oss-research/00-0-synthesis.md): 6개 프로젝트 비교, 기본 점검, 골드셋 파일럿. 프로젝트별 원본 근거는 [`oss-research/`](research/oss-research/)의 `project-research.md`에 통합돼 있습니다.

## 로컬 실행과 확인

```bash
npm install
npm run dev
npm run test:unit
npm run lint
```

DB 작업은 [데이터베이스 가이드](data/database-guide.md)의 연결 설정을 먼저 확인합니다. `npm run db:migrate`, `npm run collect:aio` 등은 연결된 DB와 외부 수집 환경에 영향을 줄 수 있으므로 해당 운영 문서와 `package.json`의 실제 스크립트를 확인한 뒤 실행합니다.
