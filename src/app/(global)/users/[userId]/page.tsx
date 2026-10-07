import { notFound } from "next/navigation";
import { UserDetailClient } from "@/components/users/UserDetailClient";
import { getCurrentPrincipal, isAuthEnabled } from "@/lib/backend/auth/session";
import { getUserDetail } from "@/lib/backend/auth/userAdminStore";
import { canManageUsers } from "@/lib/auth/userManagement";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!isAuthEnabled()) notFound();
  const principal = await getCurrentPrincipal();
  if (!principal || !canManageUsers(principal)) notFound();
  const user = await getUserDetail(principal, (await params).userId);
  if (!user) notFound();
  return <UserDetailClient initial={user} currentUserId={principal.userId} />;
}
