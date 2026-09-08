// Client-safe (no node:child_process) — split out of collectionJobRunner.ts
// so client components can import the stage type without pulling child_process
// into the browser bundle. See collectionRunsTypes.ts for the same pattern.
export type CollectionStage = "install" | "naver" | "google" | "save" | "done" | "error";

export interface CollectionJob {
  id: string;
  keyword: string;
  engines: ("naver" | "google")[];
  stage: CollectionStage;
  log: string[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}
