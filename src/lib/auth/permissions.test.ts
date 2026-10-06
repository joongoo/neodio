import assert from "node:assert/strict";
import test from "node:test";
import { canAccessOrg, canEditBrand, canManageOrg, canViewBrand, filterViewableBrands, isPending, roleLabel, type Principal } from "./permissions";

const owner: Principal = { userId: "u-owner", platformRole: "none", memberships: [{ organizationId: "o1", role: "admin", isOwner: true, brandIds: [] }] };
const adminA: Principal = { userId: "u-a", platformRole: "none", memberships: [{ organizationId: "o1", role: "admin", isOwner: false, brandIds: ["b1"] }] };
const adminB: Principal = { userId: "u-b", platformRole: "none", memberships: [{ organizationId: "o1", role: "admin", isOwner: false, brandIds: ["b2", "b3"] }] };
const viewer: Principal = { userId: "u-v", platformRole: "none", memberships: [{ organizationId: "o1", role: "viewer", isOwner: false, brandIds: ["b1"] }] };
const staff: Principal = { userId: "u-s", platformRole: "staff", memberships: [] };
const pending: Principal = { userId: "u-p", platformRole: "none", memberships: [] };

test("오너는 모든 브랜드를 편집하고 조직을 관리한다", () => {
  assert.ok(canEditBrand(owner, "o1", "b1") && canEditBrand(owner, "o1", "b99"));
  assert.ok(canManageOrg(owner, "o1"));
  assert.ok(!canManageOrg(owner, "o2"));
  assert.ok(!canAccessOrg(owner, "o2"));
});

test("admin은 지정받은 브랜드만 편집하고 admin마다 다르다", () => {
  assert.ok(canEditBrand(adminA, "o1", "b1"));
  assert.ok(!canEditBrand(adminA, "o1", "b2"));
  assert.ok(canEditBrand(adminB, "o1", "b3") && !canEditBrand(adminB, "o1", "b1"));
  assert.ok(!canManageOrg(adminA, "o1"));
  assert.ok(!canViewBrand(adminA, "o1", "b2"));
});

test("viewer는 지정받은 브랜드를 읽기만 한다", () => {
  assert.ok(canViewBrand(viewer, "o1", "b1"));
  assert.ok(!canEditBrand(viewer, "o1", "b1"));
  assert.ok(!canViewBrand(viewer, "o1", "b2"));
  assert.ok(!canManageOrg(viewer, "o1"));
});

test("네오다임 직원은 모든 조직·브랜드를 편집하고 관리한다", () => {
  assert.ok(canEditBrand(staff, "o9", "b9") && canManageOrg(staff, "o9") && canAccessOrg(staff, "o9"));
  assert.ok(!isPending(staff));
});

test("소속이 없는 가입자는 대기 상태이고 아무것도 못 본다", () => {
  assert.ok(isPending(pending));
  assert.ok(!canAccessOrg(pending, "o1") && !canViewBrand(pending, "o1", "b1"));
});

test("볼 수 있는 브랜드만 거르고, 역할 이름을 표기한다", () => {
  const brands = [{ id: "b1" }, { id: "b2" }, { id: "b3" }];
  assert.deepEqual(filterViewableBrands(adminB, "o1", brands).map((b) => b.id), ["b2", "b3"]);
  assert.equal(filterViewableBrands(owner, "o1", brands).length, 3);
  assert.equal(roleLabel(owner.memberships[0]), "오너");
  assert.equal(roleLabel(adminA.memberships[0]), "admin");
  assert.equal(roleLabel(viewer.memberships[0]), "viewer");
});
