import { redirect } from "next/navigation";
import { PendingPanel } from "@/components/auth/AuthForms";
import { isPending } from "@/lib/auth/permissions";
import { getCurrentPrincipal, getCurrentUser } from "@/lib/backend/auth/session";

// 권한이 아직 할당되지 않은 가입자가 보는 화면 — 할당되면 서비스로 보낸다.
export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const principal = await getCurrentPrincipal();
  if (principal && !isPending(principal)) redirect("/");
  return <PendingPanel name={user.name} email={user.email} />;
}
