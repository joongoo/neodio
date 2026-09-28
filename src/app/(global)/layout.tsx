import { AppShell } from "@/components/layout/AppShell";

// 조직·브랜드와 무관한 화면(/help, /organizations) — 헤더는 마지막으로 본 조직·브랜드 기준.
export const dynamic = "force-dynamic";

export default function GlobalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
