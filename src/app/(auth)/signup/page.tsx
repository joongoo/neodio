import Link from "next/link";
import { SignupForm } from "@/components/auth/AuthForms";
import { isSignupEnabled } from "@/lib/backend/auth/session";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (!isSignupEnabled()) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-7 shadow-sm">
        <h1 className="text-lg font-bold text-neutral-900">직접 가입은 받지 않아요</h1>
        <p className="mt-2 text-sm text-neutral-600">계정은 조직 관리자(오너·admin) 또는 네오다임 담당자가 발급해 드려요. 계정이 필요하면 담당자에게 요청해 주세요.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-slate-800 underline">로그인으로 돌아가기</Link>
      </div>
    );
  }
  return <SignupForm />;
}
