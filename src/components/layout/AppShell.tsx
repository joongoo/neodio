import { ReactNode } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 헤더 + 사이드바 + 본문. 조직·브랜드 화면([org]/[brand]/layout.tsx)과 조직 무관
// 화면((global)/layout.tsx)이 함께 쓴다. 사이드바 링크는 현재 조직·브랜드 주소
// (/{조직}/{브랜드})를 앞에 붙인다 — 조직 무관 화면에서는 마지막으로 본 조직·브랜드.
export async function AppShell({ children }: { children: ReactNode }) {
  const tenant = await getCurrentTenant();
  return (
    <>
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar base={tenant.base} />
        <main className="flex-1 overflow-y-auto bg-neutral-50">{children}</main>
      </div>
    </>
  );
}
