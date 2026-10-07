import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPromptStore } from "../database";
import type { Membership, OrgRole, PlatformRole, Principal } from "@/lib/auth/permissions";
import { generateTempPassword, hashPassword, passwordProblem, verifyPassword } from "./password";

// 회원·세션·역할 저장소 — 서버 전용. 이메일 인증은 하지 않는다(docs/auth-and-roles.md).

export const SESSION_COOKIE = "neodio-session";
const SESSION_DAYS = 14;
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const now = () => new Date().toISOString();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  status: "active" | "disabled";
}

export class AuthError extends Error {
  constructor(message: string, readonly code: "invalid" | "exists" | "denied" | "not_found" = "invalid") {
    super(message);
  }
}

function toUser(row: Record<string, unknown>): AuthUser {
  return {
    id: row.id as string, email: row.email as string, name: row.name as string,
    platformRole: row.platform_role as PlatformRole, mustChangePassword: !!row.must_change_password, status: row.status as AuthUser["status"],
  };
}

async function db() {
  return getPromptStore();
}

// ---- 가입·로그인 ----

export async function createUser(input: {
  email: string; name: string; password: string; platformRole?: PlatformRole; mustChangePassword?: boolean;
}): Promise<AuthUser> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email)) throw new AuthError("이메일 형식이 올바르지 않아요.");
  const name = input.name.trim();
  if (!name) throw new AuthError("이름을 입력해주세요.");
  const problem = passwordProblem(input.password, email);
  if (problem) throw new AuthError(problem);
  const store = await db();
  const [existing] = await store.query("SELECT id FROM neodio_users WHERE lower(email)=$1", [email]);
  if (existing) throw new AuthError("이미 가입된 이메일이에요.", "exists");
  const userId = id("user");
  await store.query("INSERT INTO neodio_users(id,email,name,password_hash,must_change_password,platform_role,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,'active',$7)", [
    userId, email, name, await hashPassword(input.password), !!input.mustChangePassword, input.platformRole ?? "none", now()]);
  return (await getUser(userId))!;
}

export async function getUser(userId: string): Promise<AuthUser | null> {
  const store = await db();
  const [row] = await store.query("SELECT * FROM neodio_users WHERE id=$1 AND deleted_at IS NULL", [userId]);
  return row ? toUser(row) : null;
}

// 존재하지 않는 이메일에도 같은 시간이 걸리게 더미 해시와 비교한다(이메일 존재 여부 노출 방지).
let dummyHash: Promise<string> | null = null;

export async function verifyLogin(emailInput: string, password: string): Promise<AuthUser | null> {
  const store = await db();
  const [row] = await store.query("SELECT * FROM neodio_users WHERE lower(email)=$1 AND deleted_at IS NULL", [normalizeEmail(emailInput)]);
  if (!row) {
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  const ok = await verifyPassword(password, row.password_hash as string);
  if (!ok || row.status !== "active") return null;
  await store.query("UPDATE neodio_users SET last_login_at=$1 WHERE id=$2", [now(), row.id]);
  return toUser(row);
}

// ---- 세션 ----

export async function createSession(userId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const store = await db();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await store.query("INSERT INTO neodio_sessions(token_hash,user_id,created_at,expires_at,user_agent) VALUES ($1,$2,$3,$4,$5)", [
    hashToken(token), userId, now(), expiresAt.toISOString(), userAgent?.slice(0, 200) ?? null]);
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const store = await db();
  const [row] = await store.query(
    `SELECT u.* FROM neodio_sessions s JOIN neodio_users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.deleted_at IS NULL AND u.status='active'`, [hashToken(token), now()]);
  return row ? toUser(row) : null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await (await db()).query("DELETE FROM neodio_sessions WHERE token_hash=$1", [hashToken(token)]);
}

/** 이 사용자의 세션을 모두 끊는다(keepToken이 있으면 그 세션만 남긴다). */
export async function deleteUserSessions(userId: string, keepToken?: string): Promise<void> {
  await (await db()).query("DELETE FROM neodio_sessions WHERE user_id=$1 AND ($2::text IS NULL OR token_hash<>$2)", [userId, keepToken ? hashToken(keepToken) : null]);
}

// ---- 비밀번호 변경(본인만) ----

export async function changePassword(userId: string, current: string, next: string, keepToken?: string): Promise<void> {
  const store = await db();
  const [row] = await store.query("SELECT * FROM neodio_users WHERE id=$1 AND deleted_at IS NULL", [userId]);
  if (!row || !(await verifyPassword(current, row.password_hash as string))) throw new AuthError("현재 비밀번호가 맞지 않아요.", "denied");
  const problem = passwordProblem(next, row.email as string);
  if (problem) throw new AuthError(problem);
  if (await verifyPassword(next, row.password_hash as string)) throw new AuthError("현재 비밀번호와 다른 비밀번호를 입력해주세요.");
  await store.query("UPDATE neodio_users SET password_hash=$1,must_change_password=false WHERE id=$2", [await hashPassword(next), userId]);
  await deleteUserSessions(userId, keepToken); // 다른 기기의 로그인은 끊는다
}

// ---- 권한(Principal) ----

export async function principalFor(user: AuthUser): Promise<Principal> {
  const store = await db();
  const rows = await store.query<{ organization_id: string; role: OrgRole; owner_user_id: string | null }>(
    `SELECT m.organization_id,m.role,o.owner_user_id FROM neodio_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1`, [user.id]);
  const brandRows = await store.query<{ organization_id: string; brand_id: string }>("SELECT organization_id,brand_id FROM neodio_membership_brands WHERE user_id=$1", [user.id]);
  const memberships: Membership[] = rows.map((row) => ({
    organizationId: row.organization_id, role: row.role, isOwner: row.owner_user_id === user.id,
    brandIds: brandRows.filter((b) => b.organization_id === row.organization_id).map((b) => b.brand_id),
  }));
  return { userId: user.id, platformRole: user.platformRole, memberships };
}

// ---- 구성원 관리(오너·직원이 호출 — 호출 전에 canManageOrg로 확인한다) ----

export interface MemberRow {
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  isOwner: boolean;
  brandIds: string[];
  mustChangePassword: boolean;
  status: "active" | "disabled";
  lastLoginAt: string | null;
}

export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const store = await db();
  const rows = await store.query(
    `SELECT u.id,u.email,u.name,u.must_change_password,u.status,u.last_login_at,m.role,o.owner_user_id
     FROM neodio_memberships m JOIN neodio_users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id
     WHERE m.organization_id=$1 AND u.deleted_at IS NULL ORDER BY (o.owner_user_id=u.id) DESC, m.role, u.email`, [orgId]);
  const brandRows = await store.query<{ user_id: string; brand_id: string }>("SELECT user_id,brand_id FROM neodio_membership_brands WHERE organization_id=$1", [orgId]);
  return rows.map((row) => ({
    userId: row.id as string, email: row.email as string, name: row.name as string, role: row.role as OrgRole,
    isOwner: row.owner_user_id === row.id, mustChangePassword: !!row.must_change_password, status: row.status as MemberRow["status"],
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    brandIds: brandRows.filter((b) => b.user_id === row.id).map((b) => b.brand_id),
  }));
}

export async function audit(orgId: string | null, actorUserId: string | null, action: string, targetId: string | null, detail?: unknown) {
  await (await db()).query("INSERT INTO neodio_audit_log(id,organization_id,actor_user_id,action,target_type,target_id,detail_json,at) VALUES ($1,$2,$3,$4,'user',$5,$6,$7)", [
    id("audit"), orgId, actorUserId, action, targetId, detail === undefined ? null : JSON.stringify(detail), now()]);
}

/** 가입한 사용자를 이 조직에 구성원으로 할당하거나(이미 있으면 역할만 바꾼다), 브랜드 접근을 정한다. */
export async function assignMember(orgId: string, input: { email: string; role: OrgRole; brandIds: string[] }, actorUserId: string | null): Promise<MemberRow> {
  const store = await db();
  const [user] = await store.query<{ id: string }>("SELECT id FROM neodio_users WHERE lower(email)=$1 AND deleted_at IS NULL", [normalizeEmail(input.email)]);
  if (!user) throw new AuthError("가입한 사용자를 찾을 수 없어요. 먼저 가입하거나 계정을 발급해주세요.", "not_found");
  await store.transaction(async () => {
    const [existing] = await store.query<{ role: string }>("SELECT role FROM neodio_memberships WHERE user_id=$1 AND organization_id=$2", [user.id, orgId]);
    const [org] = await store.query<{ owner_user_id: string | null }>("SELECT owner_user_id FROM organizations WHERE id=$1", [orgId]);
    if (org?.owner_user_id === user.id && input.role !== "admin") throw new AuthError("오너는 admin이어야 해요. 먼저 오너를 다른 admin에게 이전해주세요.", "denied");
    if (existing) await store.query("UPDATE neodio_memberships SET role=$1 WHERE user_id=$2 AND organization_id=$3", [input.role, user.id, orgId]);
    else await store.query("INSERT INTO neodio_memberships(user_id,organization_id,role,created_at,created_by) VALUES ($1,$2,$3,$4,$5)", [user.id, orgId, input.role, now(), actorUserId]);
    await setMemberBrands(orgId, user.id, input.brandIds, actorUserId);
    await audit(orgId, actorUserId, existing ? "member.update" : "member.add", user.id, { role: input.role, brandIds: input.brandIds });
  });
  return (await listMembers(orgId)).find((m) => m.userId === user.id)!;
}

export async function setMemberBrands(orgId: string, userId: string, brandIds: string[], actorUserId: string | null): Promise<void> {
  const store = await db();
  const valid = await store.query<{ id: string }>("SELECT id FROM brands WHERE organization_id=$1 AND id = ANY($2)", [orgId, brandIds]);
  await store.query("DELETE FROM neodio_membership_brands WHERE user_id=$1 AND organization_id=$2", [userId, orgId]);
  for (const brand of valid) {
    await store.query("INSERT INTO neodio_membership_brands(user_id,organization_id,brand_id,granted_by,granted_at) VALUES ($1,$2,$3,$4,$5)", [userId, orgId, brand.id, actorUserId, now()]);
  }
}

export async function removeMember(orgId: string, userId: string, actorUserId: string | null): Promise<void> {
  const store = await db();
  const [org] = await store.query<{ owner_user_id: string | null }>("SELECT owner_user_id FROM organizations WHERE id=$1", [orgId]);
  if (org?.owner_user_id === userId) throw new AuthError("오너는 제거할 수 없어요. 먼저 오너를 다른 admin에게 이전해주세요.", "denied");
  await store.transaction(async () => {
    await store.query("DELETE FROM neodio_membership_brands WHERE user_id=$1 AND organization_id=$2", [userId, orgId]);
    await store.query("DELETE FROM neodio_memberships WHERE user_id=$1 AND organization_id=$2", [userId, orgId]);
    await audit(orgId, actorUserId, "member.remove", userId);
  });
}

/** 오너를 이 조직의 다른 admin에게 넘긴다(오너가 비는 조직이 생기지 않게 항상 한 명을 지정한다). */
export async function setOwner(orgId: string, newOwnerUserId: string, actorUserId: string | null): Promise<void> {
  const store = await db();
  const [member] = await store.query<{ role: string }>("SELECT role FROM neodio_memberships WHERE user_id=$1 AND organization_id=$2", [newOwnerUserId, orgId]);
  if (!member) throw new AuthError("이 조직의 구성원이 아니에요.", "not_found");
  if (member.role !== "admin") throw new AuthError("오너는 admin 중에서만 정할 수 있어요.", "denied");
  await store.query("UPDATE organizations SET owner_user_id=$1 WHERE id=$2", [newOwnerUserId, orgId]);
  await audit(orgId, actorUserId, "owner.set", newOwnerUserId);
}

/** 오너·직원이 계정을 직접 만들어 준다 — 임시 비밀번호를 돌려주고(메일 발송 없음), 첫 로그인 때 바꾸게 한다. */
export async function issueAccount(orgId: string | null, input: { email: string; name: string; role?: OrgRole; brandIds?: string[] }, actorUserId: string | null): Promise<{ user: AuthUser; tempPassword: string }> {
  const tempPassword = generateTempPassword();
  const user = await createUser({ email: input.email, name: input.name, password: tempPassword, mustChangePassword: true });
  if (orgId) await assignMember(orgId, { email: user.email, role: input.role ?? "viewer", brandIds: input.brandIds ?? [] }, actorUserId);
  await audit(orgId, actorUserId, "account.issue", user.id);
  return { user, tempPassword };
}

/** 비밀번호를 잊은 구성원에게 임시 비밀번호를 다시 발급한다(이메일 재설정은 없다). 기존 세션은 끊는다. */
export async function reissueTempPassword(orgId: string, userId: string, actorUserId: string | null): Promise<string> {
  const store = await db();
  const [member] = await store.query("SELECT 1 FROM neodio_memberships WHERE user_id=$1 AND organization_id=$2", [userId, orgId]);
  if (!member) throw new AuthError("이 조직의 구성원이 아니에요.", "not_found");
  const tempPassword = generateTempPassword();
  await store.query("UPDATE neodio_users SET password_hash=$1,must_change_password=true WHERE id=$2", [await hashPassword(tempPassword), userId]);
  await deleteUserSessions(userId);
  await audit(orgId, actorUserId, "password.reissue", userId);
  return tempPassword;
}
