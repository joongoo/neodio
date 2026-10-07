import { Suspense } from "react";
import { LoginForm } from "@/components/auth/AuthForms";
import { isSignupEnabled } from "@/lib/backend/auth/session";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm signupEnabled={isSignupEnabled()} />
    </Suspense>
  );
}
