// Client-safe (no node:child_process) — split out of collectionJobRunner.ts
// so client components can import the stage type without pulling child_process
// into the browser bundle. See collectionRunsTypes.ts for the same pattern.
export type CollectionStage = "install" | "naver" | "google" | "save" | "done" | "error" | "cancelled";

export interface CollectionJob {
  id: string;
  /** 수집을 시작한 조직 — 결과 파일이 이 조직으로 들어간다. 예전 작업엔 없음(기본 조직). */
  organizationId?: string;
  keyword: string;
  engines: ("naver" | "google")[];
  stage: CollectionStage;
  log: string[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}
