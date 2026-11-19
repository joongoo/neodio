import type { PromptSurface } from "./promptSurfaces";

export const SERP_API_SURFACES = ["google-aio", "google-ai-mode", "naver-aio"] as const;
export type SerpApiSurface = (typeof SERP_API_SURFACES)[number];

// Standard queue, normal priority estimates (verified 2026-11-12).
// Google AIO = Organic base $0.0006 + async AI Overview option $0.0006.
export const SERP_API_ESTIMATED_COST_USD: Record<SerpApiSurface, number> = {
  "google-aio": 0.0012,
  "google-ai-mode": 0.0012,
  "naver-aio": 0.0006,
};

export function isSerpApiSurface(surface: PromptSurface): surface is SerpApiSurface {
  return (SERP_API_SURFACES as readonly string[]).includes(surface);
}

export interface SerpApiCostRow {
  surface: SerpApiSurface;
  queries: number;
  unitCostUsd: number;
  estimatedCostUsd: number;
}

export function estimateSerpApiCost(
  counts: Readonly<Record<PromptSurface, number>>,
  enabled: ReadonlySet<SerpApiSurface>,
  aioDeviceCount: number,
): { rows: SerpApiCostRow[]; totalQueries: number; totalCostUsd: number } {
  const rows = SERP_API_SURFACES.filter((surface) => enabled.has(surface) && counts[surface] > 0).map((surface) => {
    const queries = counts[surface] * (surface === "google-aio" ? Math.max(1, aioDeviceCount) : 1);
    const unitCostUsd = SERP_API_ESTIMATED_COST_USD[surface];
    return { surface, queries, unitCostUsd, estimatedCostUsd: queries * unitCostUsd };
  });
  return {
    rows,
    totalQueries: rows.reduce((sum, row) => sum + row.queries, 0),
    totalCostUsd: rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
  };
}
