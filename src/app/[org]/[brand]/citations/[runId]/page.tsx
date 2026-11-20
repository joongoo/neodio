import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { loadCitationDetailPage } from "@/lib/backend/citationDetail";
import { citationEngine } from "@/lib/citationEngines";
import { citationDevice, supportsCitationDevices } from "@/lib/citationDevices";
import { CitationDetailView } from "@/components/citations/CitationDetailView";

export const dynamic = "force-dynamic";

export default async function CitationSnapshotPage({ params, searchParams }: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await getCurrentTenant();
  if (tenant.demo || !tenant.brand) notFound();
  const { runId } = await params;
  const query = await searchParams;
  const engine = citationEngine(query.engine);
  let decodedRunId: string;
  try { decodedRunId = decodeURIComponent(runId); } catch { notFound(); }
  const data = await loadCitationDetailPage(tenant.orgId, tenant.brand, engine, decodedRunId);
  if (!data) notFound();
  const back = new URLSearchParams({ engine });
  if (supportsCitationDevices(engine) && typeof query.device === "string") back.set("device", citationDevice(query.device, engine));
  for (const key of ["range", "q", "citation", "promptPage", "videoPage", "size", "videoSize"]) {
    if (typeof query[key] === "string") back.set(key, query[key]);
  }
  return <CitationDetailView data={data} engine={engine} base={tenant.base} backHref={`${tenant.base}/citations?${back}`} params={query} />;
}
