import { notFound } from "next/navigation";
import { UsersClient } from "@/components/users/UsersClient";
import { getCurrentPrincipal, isAuthEnabled } from "@/lib/backend/auth/session";
import { listUsers } from "@/lib/backend/auth/userAdminStore";
import { canManageUsers } from "@/lib/auth/userManagement";
import { isStaff } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// 유저 관리 — 네오다임 직원은 전체 유저, 오너·admin은 자기 조직 유저. 유저(viewer)에게는 화면이 없다.
export default async function UsersPage() {
  if (!isAuthEnabled()) {
    return <p className="mx-auto max-w-3xl p-10 text-center text-sm text-neutral-500">로그인 기능이 꺼져 있어 유저 관리를 쓸 수 없어요.</p>;
  }
  const principal = await getCurrentPrincipal();
  if (!principal || !canManageUsers(principal)) notFound();
  return <UsersClient users={await listUsers(principal)} isStaff={isStaff(principal)} />;
}
