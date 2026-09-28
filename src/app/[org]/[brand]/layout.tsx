import { AppShell } from "@/components/layout/AppShell";

// /{조직}/{브랜드}/… — 조직·브랜드가 바뀌면 이 레이아웃이 다시 그려져 헤더도 따라 바뀐다.
export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
