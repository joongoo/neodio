import { OrganizationsClient } from "@/components/organizations/OrganizationsClient";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 조직 추가/삭제가 곧바로 반영돼야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const [tenant, organizations] = await Promise.all([getCurrentTenant(), getPromptStore().then((store) => store.listOrganizations())]);
  return <OrganizationsClient initial={organizations} currentOrgId={tenant.orgId} />;
}
