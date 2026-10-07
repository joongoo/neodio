import assert from "node:assert/strict";
import test from "node:test";
import type { Principal } from "./permissions";
import { assignableBrandIds, canAssignBrands, canAssignOrg, canChangeRole, canEditUserProfile, canManageUsers, canReissuePassword, canSeeUser, mergeBrandAssignment, visibleOrgIds, type UserTarget } from "./userManagement";

const mk = (userId: string, role: "admin" | "viewer", isOwner: boolean, brandIds: string[], org = "o1"): Principal => ({
  userId, platformRole: "none", memberships: [{ organizationId: org, role, isOwner, brandIds }],
});
const staff: Principal = { userId: "s", platformRole: "staff", memberships: [] };
const owner = mk("owner", "admin", true, []);
const adminA = mk("adminA", "admin", false, ["b1", "b2"]);
const viewer = mk("v", "viewer", false, ["b1"]);
const t = (userId: string, role: "admin" | "viewer", isOwner = false, org = "o1"): UserTarget => ({ userId, platformRole: "none", memberships: [{ organizationId: org, role, isOwner }] });

test("유저 관리 화면은 직원·오너·admin만 보고 viewer는 못 본다", () => {
  assert.ok(canManageUsers(staff) && canManageUsers(owner) && canManageUsers(adminA));
  assert.ok(!canManageUsers(viewer));
});

test("목록 범위: 직원은 전체(null), 오너·admin은 자기가 admin인 조직", () => {
  assert.equal(visibleOrgIds(staff), null);
  assert.deepEqual(visibleOrgIds(owner), ["o1"]);
  assert.deepEqual(visibleOrgIds(adminA), ["o1"]);
  assert.ok(canSeeUser(owner, t("x", "viewer")) && !canSeeUser(owner, t("y", "viewer", false, "o2")));
  assert.ok(canSeeUser(staff, { userId: "pending", platformRole: "none", memberships: [] })); // 소속 없는 가입자도 직원은 본다
  assert.ok(!canSeeUser(owner, { userId: "pending", platformRole: "none", memberships: [] }));
});

test("조직 할당은 직원만, 역할 변경은 직원과 오너만(오너 역할은 불가)", () => {
  assert.ok(canAssignOrg(staff) && !canAssignOrg(owner) && !canAssignOrg(adminA));
  assert.ok(canChangeRole(staff, "o1", t("x", "viewer")) && canChangeRole(owner, "o1", t("x", "viewer")));
  assert.ok(!canChangeRole(adminA, "o1", t("x", "viewer")));
  assert.ok(!canChangeRole(owner, "o1", t("o", "admin", true)));
});

test("브랜드 할당 범위: 오너·직원은 조직 전체, admin은 본인 브랜드 안", () => {
  const all = ["b1", "b2", "b3"];
  assert.deepEqual(assignableBrandIds(owner, "o1", all), all);
  assert.deepEqual(assignableBrandIds(staff, "o1", all), all);
  assert.deepEqual(assignableBrandIds(adminA, "o1", all), ["b1", "b2"]);
  assert.deepEqual(assignableBrandIds(viewer, "o1", all), []);
  assert.ok(canAssignBrands(adminA, "o1", t("x", "viewer")));
  assert.ok(!canAssignBrands(adminA, "o1", t("o", "admin", true))); // 오너는 항상 전체
  assert.ok(!canAssignBrands(viewer, "o1", t("x", "viewer")));
});

test("admin이 범위 밖 브랜드를 건드리지 못한다", () => {
  // 대상은 b3(admin 범위 밖)과 b1을 갖고 있다. admin(b1,b2)이 [b2]로 바꾸면 b3는 남고 b1은 빠진다.
  assert.deepEqual(mergeBrandAssignment(["b1", "b3"], ["b2"], ["b1", "b2"]).sort(), ["b2", "b3"]);
  // 범위 밖 브랜드를 요청해도 무시된다.
  assert.deepEqual(mergeBrandAssignment([], ["b3", "b1"], ["b1", "b2"]), ["b1"]);
});

test("프로필 수정: 오너 계정은 admin이 못 건드리고, 직원 계정은 직원만", () => {
  assert.ok(canEditUserProfile(staff, t("o", "admin", true)));
  assert.ok(!canEditUserProfile(adminA, t("o", "admin", true)));
  assert.ok(canEditUserProfile(adminA, t("x", "viewer")));
  assert.ok(canEditUserProfile(owner, t("a", "admin")));
  assert.ok(!canEditUserProfile(owner, { userId: "st", platformRole: "staff", memberships: [{ organizationId: "o1", role: "admin", isOwner: false }] }));
});

test("임시 비밀번호 재발급: admin은 viewer만, 오너는 admin·viewer, 직원은 모두", () => {
  assert.ok(canReissuePassword(adminA, "o1", t("x", "viewer")));
  assert.ok(!canReissuePassword(adminA, "o1", t("a2", "admin")));
  assert.ok(!canReissuePassword(adminA, "o1", t("o", "admin", true)));
  assert.ok(canReissuePassword(owner, "o1", t("a2", "admin")));
  assert.ok(!canReissuePassword(owner, "o1", { userId: "st", platformRole: "staff", memberships: [{ organizationId: "o1", role: "admin", isOwner: false }] }));
  assert.ok(canReissuePassword(staff, "o1", t("o", "admin", true)));
});
