# 계정·조직·권한

| 항목 | 내용 |
| --- | --- |
| 분류 | 기능 명세 |
| 용도 | 이 주제의 구현 상태, 설계 근거, 다음 작업을 한 곳에서 확인 |
| 상태 | 구현됨; 운영 설정은 코드 확인 |
| 확인 기준 | 현재 동작은 연결된 코드와 운영 설정; 조사·기획은 작성 당시 근거 |

## 읽는 방법

먼저 각 섹션의 상태를 확인하세요. 구현된 기능과 후속 기획을 구분했으며, 상세한 현재 동작은 연결된 코드를 기준으로 합니다.

<a id="section-01"></a>

## 01. 계정과 권한

개인 계정, 조직별 역할, 브랜드별 접근 권한이 구현돼 있다. `AUTH_ENABLED=true`일 때 로그인 세션을 강제한다. 이 문서는 권한 정책과 스키마, 운영 설정을 설명한다.

### 확정된 결정 (2026-10)

- 회원가입 + **권한 할당**이 필요하다. **이메일 인증은 하지 않는다**(2026-10 결정, 우선 권한 할당만). 가입한 사람은 권한이 없는 "대기" 상태이고, 오너 또는 네오다임 직원이 역할·브랜드를 할당해야 화면에 접근한다 — 권한 할당이 승인 단계를 대신한다.
- 인증은 **아이디 + 비밀번호, 자체 세션**(2026-10: 이메일을 아직 쓰지 않아 로그인 키를 이메일에서 아이디로 바꿨다. 영문 소문자·숫자·`. _ - @` 3~50자. DB 컬럼은 `neodio_users.login_id`(옛 `email` 컬럼은 스키마 초기화 때 자동으로 이름이 바뀐다). 이메일 인증을 붙일 때 별도 컬럼을 추가한다)(비밀번호는 scrypt 해시, 세션 토큰은 해시로 DB 저장, httpOnly 쿠키). 외부 인증 라이브러리·메일 발송 서비스가 필요 없다. 소셜 로그인·이메일 인증이 필요해지면 그때 Auth.js를 붙인다.
- 역할은 다음 넷이다. 표기는 영문 코드를 쓴다.

| 역할 | 표기 | 범위 | 할 수 있는 일 |
|---|---|---|---|
| 네오다임 직원 | `staff` (플랫폼 권한) | 모든 조직·브랜드 | 지원·운영 목적의 전체 열람·편집. 조직이 부여하는 권한이 아니라 플랫폼이 부여한다. |
| 오너 | `owner` (조직의 `admin` 중 1인) | 조직 전체 | **조직 관리**(이름·slug·삭제), 구성원 초대·제거·역할 변경, **브랜드 접근 권한 부여**(어떤 admin·viewer가 어떤 브랜드를 보는지), 브랜드 생성·삭제, 오너 이전. 모든 브랜드를 편집. |
| 조직관리자 | `admin` | **오너가 지정한 브랜드** | 지정받은 브랜드의 설정·프롬프트·수집·연동을 편집. 구성원·조직·브랜드 접근 권한은 건드리지 못한다. **admin마다 지정 브랜드가 다를 수 있다.** |
| 유저 | `viewer` | 오너가 지정한 브랜드 | 읽기 전용(대시보드·리포트 열람, PDF 내보내기). |

- 오너는 조직당 정확히 1명이고 admin 중에서 정한다(= admin이면서 오너 표시가 있는 사람).
- 브랜드 접근 권한(`membership_brands`)을 정하는 것은 **오너만** 할 수 있다.

### 권한 검사 위치

1. `src/proxy.ts` — 로그인 여부와 조직 경로 접근(소속 여부). "나중에 권한이 생기면 이 자리에서 막는다"고 주석이 있는 자리.
2. `getCurrentTenant()`(`src/lib/backend/tenant.ts`) — 현재 사용자의 조직·브랜드 접근 확인, 접근 가능한 브랜드만 `activeBrands`에 담는다.
3. 모든 쓰기 API(`src/app/api/**/route.ts`) — 역할과 브랜드 범위 확인. 읽기 전용 viewer는 쓰기 거부.

공유 비밀번호는 로그인 도입 후에도 스테이징 게이트로 유지한다.

### 현재 스키마

실제 DDL은 [`schema.ts`](../../../src/lib/backend/database/schema.ts) 기준이다. 공유 DB의 기존 테이블 이름과 충돌하지 않도록 계정 관련 테이블에는 `neodio_` 접두사를 쓴다.

| 테이블 | 현재 역할 |
| --- | --- |
| `neodio_users` | `login_id`, 이름, 비밀번호 해시, 플랫폼 역할, 상태 |
| `neodio_sessions` | 해시한 세션 토큰과 만료 시각 |
| `neodio_memberships`, `neodio_membership_brands` | 조직 역할과 브랜드별 접근 범위 |
| `neodio_audit_log` | 계정·권한 변경과 접속 기록 |
| `neodio_auth_throttle` | 로그인·가입 시도 제한 상태 |
| `organizations.owner_user_id` | 조직 오너 참조 |

아래 SQL은 초기 기획 초안이다. `users`/`sessions` 등의 이름과 일부 열은 실제 스키마와 다르므로 신규 구현·마이그레이션에 사용하지 않는다.

### 초기 스키마 초안 (기록용)

```sql
users (id, email UNIQUE, name, password_hash, must_change_password BOOLEAN DEFAULT false,
       email_verified_at NULL,                           -- 지금은 사용하지 않는다(후속 단계)
       platform_role TEXT NOT NULL DEFAULT 'none',      -- 'none' | 'staff'
       status TEXT NOT NULL DEFAULT 'active',            -- active | disabled
       created_at, last_login_at, deleted_at)
accounts (user_id, provider, provider_account_id, ...)   -- Google 등 OAuth 연결
sessions (id, user_id, expires_at)
-- verification_tokens: 이메일 인증·재설정을 붙일 때 추가 (지금은 만들지 않는다)

memberships (user_id, organization_id,
             role TEXT NOT NULL CHECK(role IN ('admin','viewer')),
             status TEXT NOT NULL,                       -- invited | active | disabled
             invited_by, joined_at, PRIMARY KEY(user_id, organization_id))
organizations ADD COLUMN owner_user_id TEXT REFERENCES users(id)   -- 오너(admin 중 1인), 조직당 1명
membership_brands (user_id, organization_id, brand_id, granted_by, granted_at,
                   PRIMARY KEY(user_id, organization_id, brand_id))
                   -- admin·viewer는 여기 있는 브랜드만 접근. 오너는 항상 전체.
-- invitations: 메일로 초대하는 흐름을 붙일 때 추가 (지금은 오너가 계정을 직접 발급한다)

audit_log (id, organization_id, actor_user_id, action,   -- 로그인, 초대, 역할·브랜드 권한 변경, 연동 변경, 삭제 …
           target_type, target_id, before_json, after_json, ip, at)

ALTER TABLE actors ADD COLUMN user_id TEXT REFERENCES users(id);   -- created_by/added_by를 사용자와 연결
```

규칙:
- `owner_user_id`의 사용자는 그 조직에서 `memberships.role = 'admin'`이어야 한다(코드에서 검증).
- 오너는 자기 자신의 오너 지위를 다른 admin에게 이전만 할 수 있다(조직이 오너 없이 남지 않게).
- 회원 탈퇴는 소프트 삭제 + 익명화(`deleted_at`, 표시 이름 제거)이고 `actors`·감사 로그는 남긴다. 오너는 이전 후에만 탈퇴할 수 있다.
- 설정 변경 이력(`change_log`)의 `actor_id`는 `actors.user_id`로 사용자와 이어진다.

### 가입과 계정 발급 (이메일 인증 없음)

- **자가 가입**: 아이디 + 이름 + 비밀번호 → 계정 생성(대기). 소속 조직이 없으면 "권한 할당을 기다리는 중" 화면만 보인다.
- **오너가 직접 계정 발급**: 조직 관리에서 아이디·역할·브랜드를 지정해 만들면 임시 비밀번호를 한 번 보여 주고(메일 발송 없음), 첫 로그인 때 비밀번호를 바꾸게 한다.
- **비밀번호는 변경만 가능하다**: 로그인한 본인이 현재 비밀번호를 입력해 새 비밀번호로 바꾼다. 이메일 기반 재설정("비밀번호 찾기")은 만들지 않는다. 변경하면 다른 기기의 세션은 모두 끊는다.
- 이메일 소유 확인이 없어서 오타·도용 주소로 가입할 수 있다. 접근은 오너가 할당해야 열리므로 위험은 제한되지만, 비밀번호 재설정(이메일)은 불가능하다 — 분실 시 오너·직원이 임시 비밀번호를 다시 발급한다.
- 이메일 인증은 하지 않고 비밀번호 "찾기"도 만들지 않는다. 필요해지면 메일 발송 서비스를 붙이는 후속 단계에서 정한다.

### 단계

1. 가입·로그인·로그아웃, 대기 화면, 소속 조직·브랜드만 접근 (스키마, 세션, 프록시·테넌트 게이트)
2. 조직 관리 화면: 계정 발급, 역할 변경, 브랜드 접근 권한 부여(오너 전용)
3. 모든 API·화면 권한 점검 (조직·역할·브랜드 기준 전체 재검증)
4. (필요해질 때) 이메일 인증·비밀번호 찾기(메일 발송 서비스), 소셜 로그인, 2단계 인증

### 구현 현황과 켜는 방법

구현됨: 스키마(`neodio_users`, `neodio_sessions`, `neodio_memberships`, `neodio_membership_brands`, `neodio_audit_log`, `neodio_auth_throttle`, `organizations.owner_user_id`),
가입·로그인·로그아웃·비밀번호 변경 API와 화면(`/login`, `/signup`, `/pending`, `/account`),
조직·브랜드 접근 필터(`getCurrentTenant`), 모든 API 라우트의 권한 검사(`guardApi`),
조직 관리 화면의 구성원 관리(계정 발급, 역할·브랜드 할당, 임시 비밀번호 재발급, 오너 이전).

켜는 순서:

1. 첫 계정을 만든다 — 네오다임 직원: `npx tsx scripts/create-user.ts --id 아이디 --name 이름 --staff`
   (비밀번호는 실행 중 숨겨서 입력). 조직 오너: `... --org <조직 slug> --owner`.
2. 환경변수 `AUTH_ENABLED=true`를 설정하고 다시 배포한다. 켜면 로그인 없이는 아무 화면·API도 열리지 않는다.
3. 직원 계정으로 로그인해 조직 관리에서 오너·구성원을 할당한다.
4. 안정되면 공유 비밀번호(`SITE_PASSWORD`)를 제거한다(켜 둬도 동작은 하지만 브라우저가 이중으로 묻는다). 운영은 2026-10-07에 1~4를 모두 마쳤다(Preview 환경에는 `SITE_PASSWORD`가 남아 있다).

운영 스위치:

- `SIGNUP_ENABLED=false` — 자가 가입을 닫는다(기본은 열림). 닫으면 `/signup`은 안내만 보이고 가입 API는 403이며, 계정은 조직 관리·유저 관리의 계정 발급으로만 만든다.
- 로그인·로그아웃은 `neodio_audit_log`(`auth.login`·`auth.logout`, 접속 기기 정보 포함)에 남고 유저 상세의 "최근 접속"에 보인다. 만료된 세션은 로그인할 때 가끔 정리한다.
- "관리자 승인 대기"(`/pending`)는 소속 조직이 없거나, 조직은 있어도 볼 수 있는 브랜드가 하나도 없는 사람(오너·직원 제외)이 본다.

API 권한 수준(`src/lib/backend/auth/guard.ts`): `read`(구성원이 이 조직·브랜드를 볼 수 있음), `write`(브랜드 편집 — admin은 지정 브랜드만),
`manageOrg`(오너·직원), `staff`(직원만: 조직 생성·삭제). 조직 이름·slug 변경은 오너, 브랜드 생성·삭제는 오너, 브랜드 설정 편집은 지정받은 admin도 가능하다.

알려진 제한(다음 단계):
- 로그인·가입 시도 제한은 `src/lib/backend/auth/throttleStore.ts`에 구현돼 있다. 로그인은 아이디·IP별 실패, 가입은 IP별 시도를 DB에 기록하며 한도 초과 시 429를 반환한다.
- 화면의 편집 버튼은 viewer에게도 보인다(눌러도 서버가 403으로 막는다). 역할에 따라 버튼을 숨기는 작업이 남아 있다.
- 구성원은 오너·직원만 볼 수 있다(admin은 구성원 목록을 읽지 못한다).

### 유저 관리 화면 (`/users`, `/users/[userId]`)

| | 네오다임 | 오너 | admin | 유저(viewer) |
|---|---|---|---|---|
| 화면 | 보임 | 보임 | 보임 | **숨김**(사이드바 링크 없음, 주소로 열면 404, API 403) |
| 목록 | 전체 유저(할당 대기 포함) | 자기 조직 유저 | 자기 조직 유저 | - |
| 이름·상태(사용/중지) | 전체 | 조직 유저 | 조직 유저(오너 계정 제외) | - |
| 조직 할당·제거 | ○ | ✕ | ✕ | - |
| 역할(admin/viewer) 변경 | ○ | ○(오너 제외) | ✕ | - |
| 브랜드 할당 | 조직의 모든 브랜드 | 조직의 모든 브랜드 | **본인이 접근할 수 있는 브랜드 안에서만** | - |
| 임시 비밀번호 재발급 | 모두 | 조직의 admin·viewer | viewer만 | - |

규칙은 `src/lib/auth/userManagement.ts`(순수 함수, 테스트 있음)에 있고 저장소(`userAdminStore.ts`)와 API(`/api/users`)가 모든 쓰기에서 다시 검사한다.
- admin이 브랜드를 줄 때 범위 밖 브랜드는 요청에 있어도 무시하고, 대상이 이미 갖고 있던 범위 밖 브랜드는 그대로 유지한다.
- 오너·직원 계정은 admin이 수정하거나 임시 비밀번호를 재발급할 수 없다(계정 탈취 방지). 본인 계정은 중지할 수 없다.
- 오너는 어느 조직에서든 조직 전체 브랜드가 항상 열려 있어 브랜드 할당 대상이 아니다.

<a id="section-02"></a>

## 02. 조직과 브랜드 범위

대행사처럼 여러 고객사(예: Neodigm, Salesforce)를 **조직** 단위로 나눠, 브랜드·프롬프트·
수집 데이터를 서로 섞이지 않게 관리한다. 로그인과 조직·브랜드 접근 권한은 [회원과 권한](access-and-organization-spec.md#section-01)에 정리돼 있다.

### URL이 조직·브랜드의 기준

모든 조직 화면은 `/{조직 슬러그}/{브랜드 슬러그}/{화면}` 아래에 있다(`src/app/[org]/[brand]/…`).
링크 공유·탭별로 다른 조직 보기·나중의 권한 검사를 URL 하나로 할 수 있게.

- **조직 슬러그**: 조직 관리에서 조직을 만들 때 입력(수정 가능 — 바꾸면 예전 링크는 열리지 않음).
  영문 소문자·숫자·하이픈 2~40자, 앱 화면 주소(`api`, `help`, `organizations`, 예전 화면 이름들)와 겹치면 안 됨.
  슬러그 도입 전 조직은 초기화 때 이름에서 만들어 채운다.
- **브랜드 슬러그**: 브랜드 이름은 한글·띄어쓰기가 있을 수 있어 **기본 URL 도메인**에서 만든다 —
  `www.salesforce.com` → `salesforce`, `neodigm.co.kr` → `neodigm`. 같은 조직에 같은 도메인이 또 있으면
  나중 것에 `-2`. "Demo"는 `demo`. 브랜드가 없는 조직은 `-`.
- 규칙: [src/lib/slug.ts](../../../src/lib/slug.ts), 주소 해석: [src/lib/tenantRouting.ts](../../../src/lib/tenantRouting.ts) (둘 다 단위 테스트).

| 요청 | 처리 ([src/proxy.ts](../../../src/proxy.ts)) |
|---|---|
| `/{조직}/{브랜드}/…` | 조직·브랜드를 요청 헤더로 서버에 넘기고 "마지막 위치" 쿠키에 기록 |
| `/api/…` | 호출한 화면 주소(Referer)의 조직·브랜드 — 탭마다 달라도 섞이지 않음. 없으면 마지막 위치 |
| 예전 주소(`/youtube-aio` 등) | 호출한 화면 또는 마지막 위치의 같은 화면으로 리다이렉트 |
| `/`, `/{조직}` | 마지막 위치 / 그 조직의 첫 브랜드로 리다이렉트 |
| `/help`, `/organizations` | 조직 무관 화면 — 헤더·사이드바는 마지막 위치 기준 |

프록시는 클라이언트가 보낸 같은 이름의 헤더를 항상 지우고 다시 쓴다. 사용자 권한이 생기면
"이 사용자가 이 조직을 볼 수 있는가"를 프록시(또는 `getCurrentTenant`)에서 막으면 된다.

### 현재 조직·브랜드 = `getCurrentTenant()`

[src/lib/backend/tenant.ts](../../../src/lib/backend/tenant.ts) — 요청마다 한 번(React `cache`). 프록시가 넘긴 헤더를
읽는다. 화면 주소의 조직·브랜드가 없으면 404(다른 조직으로 조용히 바뀌지 않게), API·조직 무관 화면은
기본 조직으로 폴백. `base`(= `/{조직}/{브랜드}`)를 링크 앞에 붙인다 — 클라이언트 컴포넌트는
[useTenantBase](../../../src/lib/useTenantBase.ts). "Demo" 브랜드는 `demo=true`이고 데이터 기준 브랜드(`brand`)는
조직의 첫 실제 브랜드다.

헤더·사이드바는 [AppShell](../../../src/components/layout/AppShell.tsx)에 있고 `[org]/[brand]/layout.tsx`·
`(global)/layout.tsx`가 쓴다 — 최상위 레이아웃은 주소가 바뀌어도 다시 그려지지 않기 때문.

**규칙**: 페이지·API는 `DEFAULT_ORG_ID`/`DEFAULT_BRAND_ID`를 쓰지 않고 `getCurrentTenant()`를 쓴다.
라이브러리 함수는 요청 정보를 몰래 읽지 않고 `orgId`/`brandId`를 인자로 받는다(테스트·CLI에서도 쓰도록) —
예외는 페이지 전용인 [collectionStatsReader.ts](../../../src/lib/backend/collectionStatsReader.ts)와
[demoMode.ts](../../../src/lib/backend/demoMode.ts).

### 무엇이 조직 단위인가

- **조직 단위(DB `organization_id`)**: 브랜드, 카테고리·토픽·프롬프트, 프롬프트 추적(조직의 브랜드별),
  수집 작업·실행·분석, LLM 브리지 항목(가이드·추천), 경쟁사 판정, 등록 URL, 콘텐츠 감사 제외 목록.
- **브랜드 단위(브랜드 id가 전역 유일)**: YouTube AIO(채널·설정·키워드·관측), GSC 토큰, 소셜 계정.
- **전역 캐시**: PageSpeed 측정(URL 단위), GSC 토큰 저장 위치(기본 조직 스코프에 브랜드 id 키로).
- **목업(`src/lib/db/data/*`)**: 기본 조직에만 있다. 새 조직은 목업 없이 실데이터만 —
  목업을 기반으로 그리는 페이지는 [emptyOrg.ts](../../../src/lib/db/data/emptyOrg.ts)의 빈 기본값을 쓴다.

### 수집 데이터가 조직을 찾는 방법

수집기 스크립트는 조직을 모른다. 화면에서 시작한 수집 작업(`collection_jobs`)에 조직이 기록되고,
수집 파일(`.tmp/*-ai/*.json`)의 `rawMetadata.collectionJobId`로 그 작업을 찾아 해당 조직으로 가져온다
([database/index.ts](../../../src/lib/backend/database/index.ts) `syncCollectedFiles`). 작업 없이 CLI로 만든
예전 파일은 기본 조직으로 들어간다. 정기 수집(`collect:scheduled`, `collect:aio`)은 모든 조직을 돈다.

### 조직 관리

설정 > 조직 관리(`/organizations`, API `/api/organizations`): 추가(이름 + URL 슬러그, 추가 즉시 전환),
이름·슬러그 변경(둘 다 중복 불가), 삭제(브랜드가 남아 있으면 거부, 비어 있으면 조직의 프롬프트·수집 기록까지 정리).
기본 조직의 표시 이름은 초기화 때 목업 이름("Neodigm")으로 맞춘다.

### 테스트

- `src/lib/backend/database/store.test.ts` — 조직 CRUD, 조직 간 프롬프트 격리, 삭제 정리
- `src/lib/backend/database/orgSync.test.ts` — 수집 파일이 작업의 조직으로 들어가는지
- `src/lib/slug.test.ts`, `src/lib/tenantRouting.test.ts` — 슬러그 규칙, 주소 해석(리다이렉트·API·예약어)
