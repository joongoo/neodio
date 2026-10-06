import { Suspense } from "react";
import { LoginForm } from "@/components/auth/AuthForms";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
