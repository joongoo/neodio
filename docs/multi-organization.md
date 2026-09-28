# 다중 조직 (multi-organization)

대행사처럼 여러 고객사(예: Neodigm, Salesforce)를 **조직** 단위로 나눠, 브랜드·프롬프트·
수집 데이터를 서로 섞이지 않게 관리한다. 사용자·권한은 아직 없다 — 누구나 모든 조직을
전환해 볼 수 있다(권한은 회원 체계 이후, 도움말 로드맵 참고).

## URL이 조직·브랜드의 기준

모든 조직 화면은 `/{조직 슬러그}/{브랜드 슬러그}/{화면}` 아래에 있다(`src/app/[org]/[brand]/…`).
링크 공유·탭별로 다른 조직 보기·나중의 권한 검사를 URL 하나로 할 수 있게.

- **조직 슬러그**: 조직 관리에서 조직을 만들 때 입력(수정 가능 — 바꾸면 예전 링크는 열리지 않음).
  영문 소문자·숫자·하이픈 2~40자, 앱 화면 주소(`api`, `help`, `organizations`, 예전 화면 이름들)와 겹치면 안 됨.
  슬러그 도입 전 조직은 초기화 때 이름에서 만들어 채운다.
- **브랜드 슬러그**: 브랜드 이름은 한글·띄어쓰기가 있을 수 있어 **기본 URL 도메인**에서 만든다 —
  `www.salesforce.com` → `salesforce`, `neodigm.co.kr` → `neodigm`. 같은 조직에 같은 도메인이 또 있으면
  나중 것에 `-2`. "Demo"는 `demo`. 브랜드가 없는 조직은 `-`.
- 규칙: [src/lib/slug.ts](../src/lib/slug.ts), 주소 해석: [src/lib/tenantRouting.ts](../src/lib/tenantRouting.ts) (둘 다 단위 테스트).

| 요청 | 처리 ([src/proxy.ts](../src/proxy.ts)) |
|---|---|
| `/{조직}/{브랜드}/…` | 조직·브랜드를 요청 헤더로 서버에 넘기고 "마지막 위치" 쿠키에 기록 |
| `/api/…` | 호출한 화면 주소(Referer)의 조직·브랜드 — 탭마다 달라도 섞이지 않음. 없으면 마지막 위치 |
| 예전 주소(`/youtube-aio` 등) | 호출한 화면 또는 마지막 위치의 같은 화면으로 리다이렉트 |
| `/`, `/{조직}` | 마지막 위치 / 그 조직의 첫 브랜드로 리다이렉트 |
| `/help`, `/organizations` | 조직 무관 화면 — 헤더·사이드바는 마지막 위치 기준 |

프록시는 클라이언트가 보낸 같은 이름의 헤더를 항상 지우고 다시 쓴다. 사용자 권한이 생기면
"이 사용자가 이 조직을 볼 수 있는가"를 프록시(또는 `getCurrentTenant`)에서 막으면 된다.

## 현재 조직·브랜드 = `getCurrentTenant()`

[src/lib/backend/tenant.ts](../src/lib/backend/tenant.ts) — 요청마다 한 번(React `cache`). 프록시가 넘긴 헤더를
읽는다. 화면 주소의 조직·브랜드가 없으면 404(다른 조직으로 조용히 바뀌지 않게), API·조직 무관 화면은
기본 조직으로 폴백. `base`(= `/{조직}/{브랜드}`)를 링크 앞에 붙인다 — 클라이언트 컴포넌트는
[useTenantBase](../src/lib/useTenantBase.ts). "Demo" 브랜드는 `demo=true`이고 데이터 기준 브랜드(`brand`)는
조직의 첫 실제 브랜드다.

헤더·사이드바는 [AppShell](../src/components/layout/AppShell.tsx)에 있고 `[org]/[brand]/layout.tsx`·
`(global)/layout.tsx`가 쓴다 — 최상위 레이아웃은 주소가 바뀌어도 다시 그려지지 않기 때문.

**규칙**: 페이지·API는 `DEFAULT_ORG_ID`/`DEFAULT_BRAND_ID`를 쓰지 않고 `getCurrentTenant()`를 쓴다.
라이브러리 함수는 요청 정보를 몰래 읽지 않고 `orgId`/`brandId`를 인자로 받는다(테스트·CLI에서도 쓰도록) —
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

설정 > 조직 관리(`/organizations`, API `/api/organizations`): 추가(이름 + URL 슬러그, 추가 즉시 전환),
이름·슬러그 변경(둘 다 중복 불가), 삭제(브랜드가 남아 있으면 거부, 비어 있으면 조직의 프롬프트·수집 기록까지 정리).
기본 조직의 표시 이름은 초기화 때 목업 이름("Neodigm")으로 맞춘다.

## 테스트

- `src/lib/backend/database/store.test.ts` — 조직 CRUD, 조직 간 프롬프트 격리, 삭제 정리
- `src/lib/backend/database/orgSync.test.ts` — 수집 파일이 작업의 조직으로 들어가는지
- `src/lib/slug.test.ts`, `src/lib/tenantRouting.test.ts` — 슬러그 규칙, 주소 해석(리다이렉트·API·예약어)
