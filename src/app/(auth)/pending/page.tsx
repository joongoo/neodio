import { redirect } from "next/navigation";
import { PendingApproval } from "@/components/auth/PendingApproval";
import { pendingReason } from "@/lib/auth/permissions";
import { CONTACT_EMAIL } from "@/lib/legal";
import { getCurrentPrincipal, getCurrentUser } from "@/lib/backend/auth/session";

// 관리자 승인 대기 — 권한이 아직 할당되지 않은 가입자가 보는 화면 — 할당되면 서비스로 보낸다.
export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const principal = await getCurrentPrincipal();
  const reason = principal ? pendingReason(principal) : "org";
  if (!reason) redirect("/");
  return <PendingApproval name={user.name} loginId={user.loginId} reason={reason} contactEmail={CONTACT_EMAIL || undefined} />;
}
