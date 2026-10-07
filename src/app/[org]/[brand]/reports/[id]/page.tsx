import { notFound } from "next/navigation";
import { ReportView } from "@/components/reports/ReportView";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getReport } from "@/lib/backend/reportStore";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  const report = await getReport(tenant.orgId, id);
  if (!report || report.brandId !== tenant.brandId) notFound();
  return <ReportView report={report} />;
}
