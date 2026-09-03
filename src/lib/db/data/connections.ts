import { GscConnection } from "../types";

// Matches Figma "Manage Connections" GSC tab (neodigm_screens_documentation.md
// §23) — the wireframe only shows the "connected" state, no OAuth flow UI.
// Keyed by brandId (not org) — each tracked brand connects its own GSC
// property, so a single org-wide row can't represent more than one brand.
// Mock now so the shape (fields, stats) is already right when real GSC OAuth
// lands — see neodigm_p0_scope.md's GSC row.
export const gscConnectionByBrand: Record<string, GscConnection> = {
  "brand-neodigm": {
    brandId: "brand-neodigm",
    status: "connected",
    accountEmail: "admin@neodigm.com",
    property: "https://neodigm.com/",
    lastSyncedAt: "2026-09-03T06:00:00.000Z",
    syncedQueries: 1_842,
    syncedImpressions: 214_600,
    syncedClicks: 6_310,
  },
};
