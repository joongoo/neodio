# 회원·권한 설계

현재는 전체에 공유 비밀번호(HTTP Basic Auth, `src/proxy.ts`) 하나만 걸려 있고 개인 계정·권한이 없다.
이 문서는 회원 체계의 확정된 결정과 스키마 초안이다. 구현 전이다.

## 확정된 결정 (2026-10)

- 회원가입 + **권한 할당**이 필요하다. **이메일 인증은 하지 않는다**(2026-10 결정, 우선 권한 할당만). 가입한 사람은 권한이 없는 "대기" 상태이고, 오너 또는 네오다임 직원이 역할·브랜드를 할당해야 화면에 접근한다 — 권한 할당이 승인 단계를 대신한다.
- 인증은 **이메일 + 비밀번호, 자체 세션**(비밀번호는 scrypt 해시, 세션 토큰은 해시로 DB 저장, httpOnly 쿠키). 외부 인증 라이브러리·메일 발송 서비스가 필요 없다. 소셜 로그인·이메일 인증이 필요해지면 그때 Auth.js를 붙인다.
- 역할은 다음 넷이다. 표기는 영문 코드를 쓴다.

| 역할 | 표기 | 범위 | 할 수 있는 일 |
|---|---|---|---|
| 네오다임 직원 | `staff` (플랫폼 권한) | 모든 조직·브랜드 | 지원·운영 목적의 전체 열람·편집. 조직이 부여하는 권한이 아니라 플랫폼이 부여한다. |
| 오너 | `owner` (조직의 `admin` 중 1인) | 조직 전체 | **조직 관리**(이름·slug·삭제), 구성원 초대·제거·역할 변경, **브랜드 접근 권한 부여**(어떤 admin·viewer가 어떤 브랜드를 보는지), 브랜드 생성·삭제, 오너 이전. 모든 브랜드를 편집. |
| 조직관리자 | `admin` | **오너가 지정한 브랜드** | 지정받은 브랜드의 설정·프롬프트·수집·연동을 편집. 구성원·조직·브랜드 접근 권한은 건드리지 못한다. **admin마다 지정 브랜드가 다를 수 있다.** |
| 유저 | `viewer` | 오너가 지정한 브랜드 | 읽기 전용(대시보드·리포트 열람, PDF 내보내기). |

- 오너는 조직당 정확히 1명이고 admin 중에서 정한다(= admin이면서 오너 표시가 있는 사람).
- 브랜드 접근 권한(`membership_brands`)을 정하는 것은 **오너만** 할 수 있다.

## 권한 검사 위치

1. `src/proxy.ts` — 로그인 여부와 조직 경로 접근(소속 여부). "나중에 권한이 생기면 이 자리에서 막는다"고 주석이 있는 자리.
2. `getCurrentTenant()`(`src/lib/backend/tenant.ts`) — 현재 사용자의 조직·브랜드 접근 확인, 접근 가능한 브랜드만 `activeBrands`에 담는다.
3. 모든 쓰기 API(`src/app/api/**/route.ts`) — 역할과 브랜드 범위 확인. 읽기 전용 viewer는 쓰기 거부.

공유 비밀번호는 로그인 도입 후에도 스테이징 게이트로 유지한다.

## 스키마 초안

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

## 가입과 계정 발급 (이메일 인증 없음)

- **자가 가입**: 이메일 + 비밀번호 → 계정 생성(대기). 소속 조직이 없으면 "권한 할당을 기다리는 중" 화면만 보인다.
- **오너가 직접 계정 발급**: 조직 관리에서 이메일·역할·브랜드를 지정해 만들면 임시 비밀번호를 한 번 보여 주고(메일 발송 없음), 첫 로그인 때 비밀번호를 바꾸게 한다.
- **비밀번호는 변경만 가능하다**: 로그인한 본인이 현재 비밀번호를 입력해 새 비밀번호로 바꾼다. 이메일 기반 재설정("비밀번호 찾기")은 만들지 않는다. 변경하면 다른 기기의 세션은 모두 끊는다.
- 이메일 소유 확인이 없어서 오타·도용 주소로 가입할 수 있다. 접근은 오너가 할당해야 열리므로 위험은 제한되지만, 비밀번호 재설정(이메일)은 불가능하다 — 분실 시 오너·직원이 임시 비밀번호를 다시 발급한다.
- 이메일 인증은 하지 않고 비밀번호 "찾기"도 만들지 않는다. 필요해지면 메일 발송 서비스를 붙이는 후속 단계에서 정한다.

## 단계

1. 가입·로그인·로그아웃, 대기 화면, 소속 조직·브랜드만 접근 (스키마, 세션, 프록시·테넌트 게이트)
2. 조직 관리 화면: 계정 발급, 역할 변경, 브랜드 접근 권한 부여(오너 전용)
3. 모든 API·화면 권한 점검 (조직·역할·브랜드 기준 전체 재검증)
4. (필요해질 때) 이메일 인증·비밀번호 찾기(메일 발송 서비스), 소셜 로그인, 2단계 인증
