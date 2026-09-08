import { CollectionRunsClient } from "@/components/collection-runs/CollectionRunsClient";
import { listCollectedRuns } from "@/lib/backend/collectionRuns";
import { processPromptRuns } from "@/lib/backend/processing";
import { seedBrands } from "@/lib/db/data/seed";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

// Always re-read .tmp/*-ai on request — the collector scripts
// (npm run collect:naver-ai / collect:google-ai) write new files between
// page loads, and this page has no other cache to invalidate.
export const dynamic = "force-dynamic";

export default async function CollectionRunsPage() {
  const [runFiles, brandsData] = await Promise.all([listCollectedRuns(), db.brandsManagement.get(DEFAULT_ORG_ID)]);
  const processed = processPromptRuns({
    organizationId: "neodigm",
    ownBrandId: "brand-neodigm",
    promptRuns: runFiles.map((f) => f.promptRun),
    brands: seedBrands,
  });

  return (
    <CollectionRunsClient
      runFiles={runFiles}
      processed={processed}
      brands={seedBrands}
      categories={brandsData?.categories.map((c) => c.name) ?? []}
    />
  );
}
