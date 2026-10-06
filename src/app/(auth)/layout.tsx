// 로그인·가입·권한 대기·내 계정 — 헤더·사이드바 없는 단순 화면.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-[400px]">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-neutral-900">Neodio</p>
        {children}
      </div>
    </main>
  );
}
