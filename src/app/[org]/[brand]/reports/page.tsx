import { ReportListClient } from "@/components/reports/ReportListClient";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { listReports } from "@/lib/backend/reportStore";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const tenant = await getCurrentTenant();
  const reports = tenant.brandId ? await listReports(tenant.orgId, tenant.brandId) : [];
  return <ReportListClient reports={reports} />;
}
