// Client-safe (no node:child_process) — split out of collectionJobRunner.ts
// so client components can import the stage type without pulling child_process
// into the browser bundle. See collectionRunsTypes.ts for the same pattern.
// "queued" = 운영(Vercel)에서 요청만 기록된 상태 — 수집 PC의 워커가 가져가 실행한다.
export type CollectionStage = "queued" | "install" | "naver" | "google" | "save" | "done" | "error" | "cancelled";

/** 작업을 실행하는 곳 — "local"은 대시보드 서버 프로세스가 직접, "worker"는 수집 PC의 워커(scripts/collection-worker.ts). */
export type CollectionRunner = "local" | "worker";

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
  /** 예전 작업엔 없음(= local) */
  runner?: CollectionRunner;
  /** 작업을 실행 중인 PC의 호스트 이름 — 프로세스 생존 확인(ownerPid)은 같은 호스트에서만 의미가 있다. */
  host?: string;
}
