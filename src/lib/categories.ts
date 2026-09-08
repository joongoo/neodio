import { seedCategories } from "./db/data/seed";

// Single canonical category list, shared by Brand Management
// (src/lib/db/data/brandsManagement.ts, mirrors seedCategories 1:1), Prompt
// Library, and every "카테고리 선택" dropdown/modal in between (Track Topic,
// Add Prompt). Previously each of these had its own hand-picked list that
// didn't match the others or the topic categories the real prompt/LLM-run
// pipeline is organized by — see docs/overview-checklists-plan.md and the
// chat thread that unified them. Derives from seedCategories directly so
// there's exactly one place to add/rename a category.
export const CANONICAL_CATEGORIES = seedCategories.map((c) => c.name);
