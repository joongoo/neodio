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
  for (const run of runs) {
    if (!store.sql.prepare("SELECT id FROM prompt_runs WHERE id=? AND organization_id=?").get(run.id, params.organizationId)) {
      throw new Error(`Run not found in organization: ${run.id}`);
    }
  }
  const analyzed = runs.map(run => store.analyze(run, params.brands));
  const mentions = analyzed.flatMap(result => result.mentions);
  const citations = analyzed.flatMap(result => result.citations);
  return { promptRuns: params.promptRuns, mentions, citations,
    visibilityScores: buildVisibilityScores({ organizationId: params.organizationId, brand: ownBrand, runs, mentions, citations }) };
}
