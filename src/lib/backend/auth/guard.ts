import { NextResponse } from "next/server";
import { canAccessOrg, canEditBrand, canManageOrg, canViewBrand, isPending, isStaff, type Principal } from "@/lib/auth/permissions";
import { canManageUsers } from "@/lib/auth/userManagement";
import { getCurrentPrincipal, getCurrentUser, isAuthEnabled } from "./session";
import { getCurrentTenant } from "../tenant";

// API 라우트의 권한 검사 — 모든 핸들러 맨 앞에서 부른다. 통과하면 null, 막으면 돌려줄 응답.
// AUTH_ENABLED가 꺼져 있으면 아무것도 검사하지 않는다(지금처럼 동작).
//
// - read:      로그인한 구성원이 이 조직·브랜드를 볼 수 있는가
// - write:     이 브랜드를 편집할 수 있는가(admin은 지정받은 브랜드만, viewer는 불가)
// - manageOrg: 조직 관리 — 오너·직원
// - staff:     네오다임 직원만(조직 생성 등 플랫폼 작업)
export type GuardLevel = "read" | "write" | "manageOrg" | "staff";

const deny = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function guardApi(level: GuardLevel, options: { brandId?: string } = {}): Promise<NextResponse | null> {
  if (!isAuthEnabled()) return null;
  const user = await getCurrentUser();
  if (!user) return deny(401, "로그인이 필요해요.");
  if (user.mustChangePassword) return deny(403, "비밀번호를 먼저 바꿔주세요.");
  const principal = await getCurrentPrincipal();
  if (!principal || isPending(principal)) return deny(403, "권한이 아직 할당되지 않았어요.");
  if (level === "staff") return isStaff(principal) ? null : deny(403, "네오다임 직원만 할 수 있어요.");

  const tenant = await getCurrentTenant();
  if (!canAccessOrg(principal, tenant.orgId)) return deny(403, "이 조직에 접근할 수 없어요.");
  if (level === "manageOrg") return canManageOrg(principal, tenant.orgId) ? null : deny(403, "조직 오너만 할 수 있어요.");

  const brandId = options.brandId ?? tenant.brandId;
  if (level === "read") {
    return !brandId || canViewBrand(principal, tenant.orgId, brandId) || canManageOrg(principal, tenant.orgId) ? null : deny(403, "이 브랜드를 볼 수 없어요.");
  }
  // write
  if (canManageOrg(principal, tenant.orgId)) return null;
  return brandId && canEditBrand(principal, tenant.orgId, brandId) ? null : deny(403, "이 브랜드를 편집할 권한이 없어요.");
}

/** 특정 조직(요청 본문·쿼리의 대상)을 관리할 수 있는가 — 조직 관리 화면은 어느 조직을 보고 있든 대상 조직을 따로 지정한다. */
export async function guardOrgTarget(orgId: string): Promise<NextResponse | null> {
  if (!isAuthEnabled()) return null;
  const user = await getCurrentUser();
  if (!user) return deny(401, "로그인이 필요해요.");
  const principal = await getCurrentPrincipal();
  if (!principal || isPending(principal)) return deny(403, "권한이 아직 할당되지 않았어요.");
  return canManageOrg(principal, orgId) ? null : deny(403, "조직 오너만 할 수 있어요.");
}

/** 로그인한 사용자가 접근할 수 있는 조직만 남긴다(로그인이 꺼져 있으면 전부). */
export async function filterAccessibleOrgs<T extends { id: string }>(orgs: T[]): Promise<T[]> {
  if (!isAuthEnabled()) return orgs;
  const principal = await getCurrentPrincipal();
  return principal ? orgs.filter((o) => canAccessOrg(principal, o.id)) : [];
}

/** 유저 관리 API — 직원·오너·admin만(viewer 불가). 통과하면 호출한 사용자의 권한(principal)을 돌려준다. */
export async function requireUserManager(): Promise<{ principal: Principal } | { denied: NextResponse }> {
  if (!isAuthEnabled()) return { denied: deny(403, "로그인 체계가 켜져 있지 않아요.") };
  const user = await getCurrentUser();
  if (!user) return { denied: deny(401, "로그인이 필요해요.") };
  if (user.mustChangePassword) return { denied: deny(403, "비밀번호를 먼저 바꿔주세요.") };
  const principal = await getCurrentPrincipal();
  if (!principal || !canManageUsers(principal)) return { denied: deny(403, "유저 관리 권한이 없어요.") };
  return { principal };
}
