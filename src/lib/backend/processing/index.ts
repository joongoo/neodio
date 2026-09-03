import {
  BrandSeed,
  CitationSeed,
  MentionSeed,
  PromptRunSeed,
  VisibilityScoreSeed,
} from "@/lib/db/types";
import { extractCitationsFromRun } from "./citations";
import { extractMentionsFromRun } from "./mentions";
import { buildVisibilityScores } from "./visibility";

export interface ProcessedPromptRuns {
  promptRuns: PromptRunSeed[];
  mentions: MentionSeed[];
  citations: CitationSeed[];
  visibilityScores: VisibilityScoreSeed[];
}

export function processPromptRuns(params: {
  organizationId: string;
  ownBrandId: string;
  promptRuns: PromptRunSeed[];
  brands: BrandSeed[];
}): ProcessedPromptRuns {
  const successfulRuns = params.promptRuns.filter((run) => run.status === "success");
  const ownBrand = params.brands.find((brand) => brand.id === params.ownBrandId);
  if (!ownBrand) throw new Error(`Unknown own brand: ${params.ownBrandId}`);

  const mentions = successfulRuns.flatMap((run) => extractMentionsFromRun(run, params.brands));
  const citations = successfulRuns.flatMap((run) => extractCitationsFromRun(run, params.brands));
  const visibilityScores = buildVisibilityScores({
    organizationId: params.organizationId,
    brand: ownBrand,
    runs: successfulRuns,
    mentions,
    citations,
  });

  return {
    promptRuns: params.promptRuns,
    mentions,
    citations,
    visibilityScores,
  };
}

export * from "./citations";
export * from "./date";
export * from "./mentions";
export * from "./visibility";
