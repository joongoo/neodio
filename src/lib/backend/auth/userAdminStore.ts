import { getPromptStore } from "../database";
import type { OrgRole, Principal } from "@/lib/auth/permissions";
import {
  assignableBrandIds, canAssignBrands, canAssignOrg, canChangeRole, canEditUserProfile, canReissuePassword, canSeeUser, mergeBrandAssignment, visibleOrgIds, type UserTarget,
} from "@/lib/auth/userManagement";
import { assignMember, AuthError, audit, brandNamesOf, deleteUserSessions, logUserChange, logUserChangeEverywhere, removeMember, reissueTempPassword, setMemberBrands } from "./authStore";
import { describeMembershipChange, describeProfileChange, type ChangeEntry } from "@/lib/changeLog";

// 유저 관리 — 목록·상세 조회와 수정. 모든 쓰기는 src/lib/auth/userManagement.ts의 규칙으로 막는다. 서버 전용.

export interface UserMembership {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  isOwner: boolean;
  brandIds: string[];
}

export interface UserRow {
  userId: string;
  email: string;
  name: string;
  status: "active" | "disabled";
  platformRole: "none" | "staff";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** 내가 볼 수 있는 조직의 소속만(오너·admin은 자기 조직 것만 보인다). */
  memberships: UserMembership[];
}

export interface OrgChoice {
  id: string;
  name: string;
  brands: { id: string; name: string }[];
  /** 내가 이 조직에서 이 유저에게 줄 수 있는 브랜드 */
  assignableBrandIds: string[];
}

export interface UserDetail extends UserRow {
  orgs: OrgChoice[];
  /** 이 유저에 대한 변경 이력(최신순) — 직원은 전체, 오너·admin은 내가 볼 수 있는 조직의 것만. */
  history: ChangeEntry[];
  /** 이 유저에 대해 내가 할 수 있는 일 — 화면이 버튼을 보이고 숨기는 데 쓴다(서버가 다시 검사한다). */
  can: { editProfile: boolean; assignOrg: boolean; changeRole: Record<string, boolean>; assignBrands: Record<string, boolean>; reissue: Record<string, boolean> };
}

async function loadUsers(actor: Principal, onlyUserId?: string): Promise<{ row: UserRow; full: UserTarget }[]> {
  const store = await getPromptStore();
  const users = await store.query<Record<string, unknown>>(
    "SELECT id,email,name,status,platform_role,must_change_password,last_login_at,created_at FROM neodio_users WHERE deleted_at IS NULL AND ($1::text IS NULL OR id=$1) ORDER BY created_at DESC", [onlyUserId ?? null]);
  const memberships = await store.query<{ user_id: string; organization_id: string; role: OrgRole; org_name: string; owner_user_id: string | null }>(
    `SELECT m.user_id,m.organization_id,m.role,o.name AS org_name,o.owner_user_id FROM neodio_memberships m JOIN organizations o ON o.id=m.organization_id`);
  const brandRows = await store.query<{ user_id: string; organization_id: string; brand_id: string }>("SELECT user_id,organization_id,brand_id FROM neodio_membership_brands");
  const visible = visibleOrgIds(actor);

  const result: { row: UserRow; full: UserTarget }[] = [];
  for (const user of users) {
    const own = memberships.filter((m) => m.user_id === user.id);
    const full: UserTarget = {
      userId: user.id as string, platformRole: user.platform_role as "none" | "staff",
      memberships: own.map((m) => ({ organizationId: m.organization_id, role: m.role, isOwner: m.owner_user_id === user.id })),
    };
    if (!canSeeUser(actor, full)) continue;
    result.push({
      full,
      row: {
        userId: user.id as string, email: user.email as string, name: user.name as string, status: user.status as UserRow["status"],
        platformRole: user.platform_role as UserRow["platformRole"], mustChangePassword: !!user.must_change_password,
        lastLoginAt: (user.last_login_at as string | null) ?? null, createdAt: user.created_at as string,
        memberships: own
          .filter((m) => visible === null || visible.includes(m.organization_id))
          .map((m) => ({
            organizationId: m.organization_id, organizationName: m.org_name, role: m.role, isOwner: m.owner_user_id === user.id,
            brandIds: brandRows.filter((b) => b.user_id === user.id && b.organization_id === m.organization_id).map((b) => b.brand_id),
          })),
      },
    });
  }
  return result;
}

export async function listUsers(actor: Principal): Promise<UserRow[]> {
  return (await loadUsers(actor)).map((entry) => entry.row);
}

export async function getUserDetail(actor: Principal, userId: string): Promise<UserDetail | null> {
  const [entry] = await loadUsers(actor, userId);
  if (!entry) return null;
  const store = await getPromptStore();
  const visible = visibleOrgIds(actor);
  const orgs = (await store.listOrganizations()).filter((o) => visible === null || visible.includes(o.id));
  const choices: OrgChoice[] = [];
  for (const org of orgs) {
    const brands = (await store.listBrands(org.id)).map((b) => ({ id: b.id, name: b.name }));
    choices.push({ id: org.id, name: org.name, brands, assignableBrandIds: assignableBrandIds(actor, org.id, brands.map((b) => b.id)) });
  }
  const orgIds = choices.map((c) => c.id);
  const flags = (fn: (orgId: string) => boolean) => Object.fromEntries(orgIds.map((id) => [id, fn(id)]));
  return {
    ...entry.row,
    history: await store.listUserChanges(userId, visible, 50),
    orgs: choices,
    can: {
      editProfile: canEditUserProfile(actor, entry.full),
      assignOrg: canAssignOrg(actor),
      changeRole: flags((id) => canChangeRole(actor, id, entry.full)),
      assignBrands: flags((id) => canAssignBrands(actor, id, entry.full)),
      reissue: flags((id) => canReissuePassword(actor, id, entry.full)),
    },
  };
}

export type UserUpdate =
  | { action: "profile"; name?: string; status?: "active" | "disabled" }
  | { action: "setMembership"; orgId: string; role: OrgRole | null }
  | { action: "setBrands"; orgId: string; brandIds: string[] }
  | { action: "reissuePassword"; orgId: string };

const deny = (message: string) => new AuthError(message, "denied");

/** 유저 수정 — 권한 규칙을 어기면 AuthError("denied"). 임시 비밀번호 재발급은 새 비밀번호를 돌려준다. */
export async function updateUser(actor: Principal, userId: string, update: UserUpdate): Promise<{ tempPassword?: string }> {
  const [entry] = await loadUsers(actor, userId);
  if (!entry) throw new AuthError("유저를 찾을 수 없어요.", "not_found");
  const { full, row } = entry;
  const store = await getPromptStore();

  if (update.action === "profile") {
    if (!canEditUserProfile(actor, full)) throw deny("이 유저의 정보를 수정할 권한이 없어요.");
    const name = update.name === undefined ? row.name : update.name.trim();
    if (!name || name.length > 50) throw new AuthError("이름은 1~50자로 입력해주세요.");
    const status = update.status ?? row.status;
    if (status === "disabled" && userId === actor.userId) throw deny("본인 계정은 중지할 수 없어요.");
    await store.query("UPDATE neodio_users SET name=$1,status=$2 WHERE id=$3", [name, status, userId]);
    if (status === "disabled") await deleteUserSessions(userId);
    await audit(null, actor.userId, "user.profile", userId, { name, status });
    const changed = describeProfileChange({ name: row.name, status: row.status }, { name, status });
    if (changed) await logUserChangeEverywhere(actor.userId, userId, "update", `정보 변경(${changed})`, { name: row.name, status: row.status }, { name, status });
    return {};
  }

  if (update.action === "setMembership") {
    const existing = row.memberships.find((m) => m.organizationId === update.orgId);
    if (update.role === null) {
      if (!canAssignOrg(actor)) throw deny("조직 할당은 네오다임 직원만 할 수 있어요.");
      await removeMember(update.orgId, userId, actor.userId); // 오너는 거부된다
      return {};
    }
    if (update.role !== "admin" && update.role !== "viewer") throw new AuthError("역할은 admin 또는 viewer여야 해요.");
    if (!existing) {
      if (!canAssignOrg(actor)) throw deny("조직 할당은 네오다임 직원만 할 수 있어요.");
      await assignMember(update.orgId, { email: row.email, role: update.role, brandIds: [] }, actor.userId);
      return {};
    }
    if (!canChangeRole(actor, update.orgId, full)) throw deny("이 유저의 역할을 바꿀 권한이 없어요.");
    await assignMember(update.orgId, { email: row.email, role: update.role, brandIds: existing.brandIds }, actor.userId);
    return {};
  }

  if (update.action === "setBrands") {
    if (!canAssignBrands(actor, update.orgId, full)) throw deny("이 유저에게 브랜드를 할당할 권한이 없어요.");
    const existing = row.memberships.find((m) => m.organizationId === update.orgId);
    const orgBrandIds = (await store.listBrands(update.orgId)).map((b) => b.id);
    const scope = assignableBrandIds(actor, update.orgId, orgBrandIds);
    const next = mergeBrandAssignment(existing?.brandIds ?? [], update.brandIds, scope);
    await setMemberBrands(update.orgId, userId, next, actor.userId);
    await audit(update.orgId, actor.userId, "user.brands", userId, { brandIds: next });
    const before = { role: existing?.role ?? "viewer", brands: await brandNamesOf(update.orgId, existing?.brandIds ?? []) };
    const after = { role: before.role, brands: await brandNamesOf(update.orgId, next) };
    const change = describeMembershipChange(before, after);
    if (change) await logUserChange(update.orgId, actor.userId, userId, change.op, `${row.memberships.find((m) => m.organizationId === update.orgId)?.organizationName ?? ""} ${change.text}`.trim(), before, after);
    return {};
  }

  if (!canReissuePassword(actor, update.orgId, full)) throw deny("이 유저의 임시 비밀번호를 발급할 권한이 없어요.");
  return { tempPassword: await reissueTempPassword(update.orgId, userId, actor.userId) };
}
