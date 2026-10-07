import Link from "next/link";
import { NeodioLogo } from "@/components/ui/NeodioLogo";
import { CONTACT_EMAIL, OPERATOR_NAME, PUBLIC_PAGES, SERVICE_NAME } from "@/lib/legal";

// 로그인 없이 볼 수 있는 공개 페이지의 공통 틀 — 헤더·사이드바 없이 본문과 하단 링크만 둔다.
export function LegalLayout({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/about" className="flex items-center gap-2 text-base font-bold text-neutral-900">
            <NeodioLogo size={28} />
            Neodio
          </Link>
          <Link href="/login" className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">로그인</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        {updated && <p className="mt-1 text-xs text-neutral-500">시행일: {updated}</p>}
        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-neutral-700">{children}</div>
      </main>
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-neutral-500">
          <span>© {OPERATOR_NAME} · {SERVICE_NAME}{CONTACT_EMAIL ? ` · 문의 ${CONTACT_EMAIL}` : ""}</span>
          <nav className="flex gap-4">
            {PUBLIC_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="underline-offset-2 hover:underline">{p.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

export const LegalList = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="flex list-disc flex-col gap-1.5 pl-5">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);
