// 유저 관리 화면의 권한 규칙(순수 함수) — docs/auth-and-roles.md.
//
// - 네오다임 직원(staff): 전체 유저를 보고 모두 수정한다. 유저 상세에서 조직 할당·브랜드 할당을 한다.
// - 오너(조직의 1인): 자기 조직 유저를 보고 수정한다. 브랜드 할당만 할 수 있다(조직 할당은 직원만).
// - admin: 자기 조직 유저를 보고 수정한다. 브랜드 할당만 할 수 있고, 본인이 접근할 수 있는 브랜드 안에서만 줄 수 있다.
// - viewer: 이 화면을 볼 수 없다.
import type { OrgRole, Principal } from "./permissions";

export interface UserTarget {
  userId: string;
  platformRole: "none" | "staff";
  memberships: { organizationId: string; role: OrgRole; isOwner: boolean }[];
}

const adminOrgIds = (p: Principal) => p.memberships.filter((m) => m.role === "admin").map((m) => m.organizationId);
const membershipOf = (p: Principal, orgId: string) => p.memberships.find((m) => m.organizationId === orgId);

/** 유저 관리 화면을 볼 수 있는가(직원·오너·admin). viewer는 불가. */
export function canManageUsers(p: Principal): boolean {
  return p.platformRole === "staff" || adminOrgIds(p).length > 0;
}

/** 목록에 보일 조직 — 직원은 null(전체), 그 외에는 본인이 admin인 조직. */
export function visibleOrgIds(p: Principal): string[] | null {
  return p.platformRole === "staff" ? null : adminOrgIds(p);
}

/** 이 유저가 목록·상세에 보이는가 — 직원은 모두, 그 외에는 내가 admin인 조직의 구성원. */
export function canSeeUser(p: Principal, target: UserTarget): boolean {
  if (p.platformRole === "staff") return true;
  const orgs = new Set(adminOrgIds(p));
  return target.memberships.some((m) => orgs.has(m.organizationId));
}

/** 이름·상태(사용/중지) 수정 — 직원은 모두, 오너·admin은 조직 구성원. 직원 계정은 직원만, 오너 계정은 오너·직원만 수정한다. */
export function canEditUserProfile(p: Principal, target: UserTarget): boolean {
  if (p.platformRole === "staff") return true;
  if (!canSeeUser(p, target) || target.platformRole === "staff") return false;
  // 오너 계정은 본인과 직원만 수정한다(admin이 오너 계정을 바꾸는 일을 막는다).
  return !target.memberships.some((m) => m.isOwner) || target.userId === p.userId;
}

/** 조직 할당(구성원으로 넣고 빼기) — 직원만. */
export function canAssignOrg(p: Principal): boolean {
  return p.platformRole === "staff";
}

/** 한 조직 안에서 역할(admin/viewer) 변경 — 직원과 그 조직 오너만. 오너의 역할은 바꾸지 못한다. */
export function canChangeRole(p: Principal, orgId: string, target: UserTarget): boolean {
  const targetMembership = target.memberships.find((m) => m.organizationId === orgId);
  if (!targetMembership || targetMembership.isOwner) return false;
  return p.platformRole === "staff" || membershipOf(p, orgId)?.isOwner === true;
}

/** 이 조직에서 내가 브랜드를 줄 수 있는 범위 — 직원·오너는 조직 전체, admin은 본인이 접근 가능한 브랜드, 그 외는 없음. */
export function assignableBrandIds(p: Principal, orgId: string, allBrandIds: string[]): string[] {
  if (p.platformRole === "staff") return allBrandIds;
  const m = membershipOf(p, orgId);
  if (!m || m.role !== "admin") return [];
  return m.isOwner ? allBrandIds : allBrandIds.filter((id) => m.brandIds.includes(id));
}

/** 이 유저의 브랜드 할당을 바꿀 수 있는가 — 직원은 모두, 오너·admin은 조직 구성원(오너의 브랜드는 항상 전체라 대상이 아니다). */
export function canAssignBrands(p: Principal, orgId: string, target: UserTarget): boolean {
  const targetMembership = target.memberships.find((m) => m.organizationId === orgId);
  if (!targetMembership || targetMembership.isOwner) return false;
  if (p.platformRole === "staff") return true;
  return membershipOf(p, orgId)?.role === "admin";
}

/**
 * 요청한 브랜드 목록을 반영한 최종 목록. 내가 줄 수 있는 범위(scope) 안의 브랜드만 요청대로 바꾸고,
 * 범위 밖에 이미 있던 브랜드는 그대로 둔다(admin이 자기 권한 밖의 브랜드를 빼앗거나 주지 못하게).
 */
export function mergeBrandAssignment(existing: string[], requested: string[], scope: string[]): string[] {
  const inScope = new Set(scope);
  const kept = existing.filter((id) => !inScope.has(id));
  return [...kept, ...requested.filter((id) => inScope.has(id))];
}

/** 임시 비밀번호 재발급 — 직원은 모두, 오너는 자기 조직의 admin·viewer, admin은 viewer만. 직원·오너 계정은 직원만(탈취 방지). */
export function canReissuePassword(p: Principal, orgId: string, target: UserTarget): boolean {
  if (p.platformRole === "staff") return true;
  if (target.platformRole === "staff") return false;
  const targetMembership = target.memberships.find((m) => m.organizationId === orgId);
  const mine = membershipOf(p, orgId);
  if (!targetMembership || !mine || mine.role !== "admin" || targetMembership.isOwner) return false;
  return mine.isOwner || targetMembership.role === "viewer";
}
