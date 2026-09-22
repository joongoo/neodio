import type { BrandSeed, PromptRunSeed } from "../../db/types";
import { getPromptStore } from "./index";
import { buildVisibilityScores, type ProcessedPromptRuns } from "../processing";

export async function processStoredPromptRuns(params: {
  organizationId: string; ownBrandId: string; promptRuns: PromptRunSeed[]; brands: BrandSeed[];
}): Promise<ProcessedPromptRuns> {
  const store = await getPromptStore();
  const ownBrand = params.brands.find(b => b.id === params.ownBrandId);
  if (!ownBrand) throw new Error(`Unknown own brand: ${params.ownBrandId}`);
  const runs = params.promptRuns.filter(run => run.status === "success");
  const found = await store.query<{ id: string }>(
    "SELECT id FROM prompt_runs WHERE organization_id=$1 AND id = ANY($2)", [params.organizationId, runs.map(run => run.id)]);
  const foundIds = new Set(found.map(row => row.id));
  for (const run of runs) if (!foundIds.has(run.id)) throw new Error(`Run not found in organization: ${run.id}`);
  const analyzed = await store.analyzeMany(runs, params.brands);
  const mentions = analyzed.flatMap(result => result.mentions);
  const citations = analyzed.flatMap(result => result.citations);
  return { promptRuns: params.promptRuns, mentions, citations,
    visibilityScores: buildVisibilityScores({ organizationId: params.organizationId, brand: ownBrand, runs, mentions, citations }) };
}
