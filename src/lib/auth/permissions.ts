// 회원 권한 판단(순수 함수) — docs/auth-and-roles.md.
//
// - staff(네오다임 직원): 모든 조직·브랜드를 보고 편집한다(플랫폼 권한).
// - owner: 조직당 1명, admin 중에서 정한다. 조직을 관리하고 구성원·브랜드 접근 권한을 정하며 모든 브랜드를 편집한다.
// - admin: 오너가 지정한 브랜드만 편집한다(admin마다 다를 수 있다). 구성원·조직은 건드리지 못한다.
// - viewer: 오너가 지정한 브랜드를 읽기만 한다.

export type OrgRole = "admin" | "viewer";
export type PlatformRole = "none" | "staff";

export interface Membership {
  organizationId: string;
  role: OrgRole;
  /** 이 조직의 오너인가(= organizations.owner_user_id가 이 사용자). owner는 role이 admin이다. */
  isOwner: boolean;
  /** 접근을 지정받은 브랜드. owner는 비어 있어도 전체 브랜드에 접근한다. */
  brandIds: string[];
}

export interface Principal {
  userId: string;
  platformRole: PlatformRole;
  memberships: Membership[];
}

const membershipOf = (p: Principal, orgId: string) => p.memberships.find((m) => m.organizationId === orgId);

export const isStaff = (p: Principal) => p.platformRole === "staff";

/** 이 조직에 속해 있는가(직원은 모든 조직). */
export function canAccessOrg(p: Principal, orgId: string): boolean {
  return isStaff(p) || !!membershipOf(p, orgId);
}

/** 이 브랜드를 볼 수 있는가. */
export function canViewBrand(p: Principal, orgId: string, brandId: string): boolean {
  if (isStaff(p)) return true;
  const m = membershipOf(p, orgId);
  if (!m) return false;
  return m.isOwner || m.brandIds.includes(brandId);
}

/** 이 브랜드의 설정·프롬프트·수집·연동을 편집할 수 있는가(viewer는 불가). */
export function canEditBrand(p: Principal, orgId: string, brandId: string): boolean {
  if (isStaff(p)) return true;
  const m = membershipOf(p, orgId);
  if (!m || m.role !== "admin") return false;
  return m.isOwner || m.brandIds.includes(brandId);
}

/** 조직 관리(이름·slug·삭제, 브랜드 생성·삭제), 구성원·역할·브랜드 접근 권한 관리 — 오너와 직원만. */
export function canManageOrg(p: Principal, orgId: string): boolean {
  if (isStaff(p)) return true;
  return !!membershipOf(p, orgId)?.isOwner;
}

/** 이 사용자가 볼 수 있는 브랜드 id만 추린다(직원·오너는 전체). */
export function filterViewableBrands<T extends { id: string }>(p: Principal, orgId: string, brands: T[]): T[] {
  return brands.filter((b) => canViewBrand(p, orgId, b.id));
}

/** 소속이 하나도 없는 가입자 — "권한 할당 대기" 화면만 본다. */
export function isPending(p: Principal): boolean {
  return !isStaff(p) && p.memberships.length === 0;
}

export const ROLE_LABEL: Record<OrgRole | "owner" | "staff", string> = {
  staff: "네오다임 직원",
  owner: "오너",
  admin: "admin",
  viewer: "viewer",
};

/** 화면에 보일 역할 이름 — 오너는 admin이면서 오너 표시가 있는 사람. */
export function roleLabel(m: Pick<Membership, "role" | "isOwner">): string {
  return m.isOwner ? ROLE_LABEL.owner : ROLE_LABEL[m.role];
}
