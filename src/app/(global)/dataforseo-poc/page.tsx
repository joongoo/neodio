import { notFound } from "next/navigation";
import { DataForSeoPocClient } from "@/components/dataforseo-poc/DataForSeoPocClient";
import { isStaff } from "@/lib/auth/permissions";
import { getCurrentPrincipal, isAuthEnabled } from "@/lib/backend/auth/session";
import { getLatestStageARun, publicStageAPlan, stageAReadiness } from "../../../../scripts/dataforseo-poc/service.mjs";

export const dynamic = "force-dynamic";

export default async function DataForSeoPocPage() {
  if (isAuthEnabled()) {
    const principal = await getCurrentPrincipal();
    if (!principal || !isStaff(principal)) notFound();
  }
  const readiness = stageAReadiness();
  const initialRun = await getLatestStageARun();
  return <DataForSeoPocClient plan={publicStageAPlan()} enabled={readiness.enabled} credentialsReady={readiness.credentialsReady} executionLocked={readiness.executionLocked} initialRun={initialRun} />;
}
