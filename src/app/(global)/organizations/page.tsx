import { OrganizationsClient } from "@/components/organizations/OrganizationsClient";
import { MembersSection } from "@/components/organizations/MembersSection";
import { getPromptStore } from "@/lib/backend/database";
import { filterAccessibleOrgs } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 조직 추가/삭제가 곧바로 반영돼야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const [tenant, organizations] = await Promise.all([getCurrentTenant(), getPromptStore().then((store) => store.listOrganizations())]);
  const visible = await filterAccessibleOrgs(organizations);
  return (
    <>
      <OrganizationsClient initial={visible} currentOrgId={tenant.orgId} />
      {/* 구성원 관리는 로그인 체계가 켜져 있고 오너(또는 직원)일 때만 — 현재 선택한 조직의 구성원이다. */}
      {tenant.principal && tenant.canManageOrg && <MembersSection orgName={tenant.org.name} currentUserId={tenant.principal.userId} />}
    </>
  );
}
