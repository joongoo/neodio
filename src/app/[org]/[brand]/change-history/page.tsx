import { ChangeHistoryClient } from "@/components/change-history/ChangeHistoryClient";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { canManageUsers } from "@/lib/auth/userManagement";

// 설정 변경 이력은 계속 쌓이므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function ChangeHistoryPage() {
  const tenant = await getCurrentTenant();
  const store = await getPromptStore();
  const [changes, versions] = await Promise.all([
    store.listChanges(tenant.orgId, { brandId: tenant.brandId || undefined, limit: PAGE_SIZE, includeUsers: !tenant.principal || canManageUsers(tenant.principal) }),
    store.listConfigVersions(tenant.orgId, tenant.brandId || undefined),
  ]);
  return <ChangeHistoryClient initialChanges={changes} versions={versions} pageSize={PAGE_SIZE} />;
}
