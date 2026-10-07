import Link from "next/link";
import { NeodioLogo } from "@/components/ui/NeodioLogo";
import { PUBLIC_PAGES } from "@/lib/legal";

// 로그인·가입·권한 대기·내 계정 — 헤더·사이드바 없는 단순 화면.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-neutral-900">
          <NeodioLogo size={48} />
          <span>Neodio</span>
        </div>
        {children}
        <nav className="mt-6 flex justify-center gap-4 text-[11px] text-neutral-400">
          {PUBLIC_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="hover:text-neutral-600 hover:underline">{p.label}</Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
