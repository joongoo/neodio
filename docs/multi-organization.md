# 다중 조직 (multi-organization)

대행사처럼 여러 고객사(예: Neodigm, Salesforce)를 **조직** 단위로 나눠, 브랜드·프롬프트·
수집 데이터를 서로 섞이지 않게 관리한다. 사용자·권한은 아직 없다 — 누구나 모든 조직을
전환해 볼 수 있다(권한은 회원 체계 이후, 도움말 로드맵 참고).

## 현재 조직·브랜드 = `getCurrentTenant()`

[src/lib/backend/tenant.ts](../src/lib/backend/tenant.ts) — 요청마다 한 번(React `cache`).

| 값 | 출처 |
|---|---|
| `orgId` | `selected-org` 쿠키(조직 id). 없거나 사라진 조직이면 기본 조직(`DEFAULT_ORG_ID`) |
| `brand` / `brandId` | `selected-brand` 쿠키(브랜드 이름)가 가리키는 그 조직의 활성 브랜드. 없으면 첫 활성 브랜드, 그것도 없으면 첫 대기 브랜드 |
| `demo` | 선택된 브랜드가 그 조직의 "Demo" 브랜드일 때만 true. Demo는 데이터 기준 브랜드가 되지 않는다 |
| `org.domain` | `brand.url`의 호스트 — 자사 사이트 판정, 사이트맵 크롤 조회 |

쿠키는 헤더의 [OrgBrandSwitcher](../src/components/layout/OrgBrandSwitcher.tsx)가 쓴다. 조직을 바꾸면
브랜드 선택을 지워 새 조직의 첫 브랜드로 시작한다. 요청 밖(테스트에서 라우트를 직접 호출, 스크립트)에는
쿠키가 없어 기본 조직이 된다.

**규칙**: 페이지·API는 `DEFAULT_ORG_ID`/`DEFAULT_BRAND_ID`를 쓰지 않고 `getCurrentTenant()`를 쓴다.
라이브러리 함수는 쿠키를 몰래 읽지 않고 `orgId`/`brandId`를 인자로 받는다(테스트·CLI에서도 쓰도록) —
예외는 페이지 전용인 [collectionStatsReader.ts](../src/lib/backend/collectionStatsReader.ts)와
[demoMode.ts](../src/lib/backend/demoMode.ts).

## 무엇이 조직 단위인가

- **조직 단위(DB `organization_id`)**: 브랜드, 카테고리·토픽·프롬프트, 프롬프트 추적(조직의 브랜드별),
  수집 작업·실행·분석, LLM 브리지 항목(가이드·추천), 경쟁사 판정, 등록 URL, 콘텐츠 감사 제외 목록.
- **브랜드 단위(브랜드 id가 전역 유일)**: YouTube AIO(채널·설정·키워드·관측), GSC 토큰, 소셜 계정.
- **전역 캐시**: PageSpeed 측정(URL 단위), GSC 토큰 저장 위치(기본 조직 스코프에 브랜드 id 키로).
- **목업(`src/lib/db/data/*`)**: 기본 조직에만 있다. 새 조직은 목업 없이 실데이터만 —
  목업을 기반으로 그리는 페이지는 [emptyOrg.ts](../src/lib/db/data/emptyOrg.ts)의 빈 기본값을 쓴다.

## 수집 데이터가 조직을 찾는 방법

수집기 스크립트는 조직을 모른다. 화면에서 시작한 수집 작업(`collection_jobs`)에 조직이 기록되고,
수집 파일(`.tmp/*-ai/*.json`)의 `rawMetadata.collectionJobId`로 그 작업을 찾아 해당 조직으로 가져온다
([database/index.ts](../src/lib/backend/database/index.ts) `syncCollectedFiles`). 작업 없이 CLI로 만든
예전 파일은 기본 조직으로 들어간다. 정기 수집(`collect:scheduled`, `collect:aio`)은 모든 조직을 돈다.

## 조직 관리

설정 > 조직 관리(`/organizations`, API `/api/organizations`): 추가(추가 즉시 전환), 이름 변경(이름은 스위처
표시에 쓰여 중복 불가), 삭제(브랜드가 남아 있으면 거부, 비어 있으면 조직의 프롬프트·수집 기록까지 정리).
기본 조직의 표시 이름은 초기화 때 목업 이름("Neodigm")으로 맞춘다.

## 테스트

- `src/lib/backend/database/store.test.ts` — 조직 CRUD, 조직 간 프롬프트 격리, 삭제 정리
- `src/lib/backend/database/orgSync.test.ts` — 수집 파일이 작업의 조직으로 들어가는지
