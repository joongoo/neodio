import { ReactNode } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { PermissionsProvider } from "@/components/auth/PermissionsProvider";
import { canManageUsers } from "@/lib/auth/userManagement";

// 헤더 + 사이드바 + 본문. 조직·브랜드 화면([org]/[brand]/layout.tsx)과 조직 무관
// 화면((global)/layout.tsx)이 함께 쓴다. 사이드바 링크는 현재 조직·브랜드 주소
// (/{조직}/{브랜드})를 앞에 붙인다 — 조직 무관 화면에서는 마지막으로 본 조직·브랜드.
export async function AppShell({ children }: { children: ReactNode }) {
  const tenant = await getCurrentTenant();
  return (
    <PermissionsProvider canEdit={tenant.canEdit} canManageOrg={tenant.canManageOrg}>
      <TopBar />
      <div data-app-shell className="flex min-h-0 flex-1">
        <Sidebar base={tenant.base} showUsers={!!tenant.principal && canManageUsers(tenant.principal)} />
        <main data-app-main className="flex-1 overflow-y-auto bg-neutral-50">
          {/* 로그인한 사용자가 이 브랜드를 볼 수만 있을 때 안내한다. */}
          {tenant.principal && !tenant.canEdit && (
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-800 print:hidden">
              읽기 전용이에요 — 이 브랜드는 볼 수만 있고 변경할 수 없어요. 편집이 필요하면 조직 오너에게 요청하세요.
            </div>
          )}
          {children}
        </main>
      </div>
    </PermissionsProvider>
  );
}
