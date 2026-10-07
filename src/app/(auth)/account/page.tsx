import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountForm } from "@/components/auth/AuthForms";
import { getCurrentUser } from "@/lib/backend/auth/session";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ force?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const forced = (await searchParams).force === "1" || user.mustChangePassword;
  return (
    <Suspense>
      <AccountForm name={user.name} loginId={user.loginId} forced={forced} />
    </Suspense>
  );
}
