"use client";

import { compareVersions, type CollectorAgentStatus } from "./collectorAgent";

// 수집기가 필요한 화면(사이트맵 크롤, AI Overview 수집 등)이 공유하는 "준비됐나?" 확인과 설치 안내 창 호출.
// 준비가 안 됐으면 이벤트로 설치 안내 창(CollectorSetupHost)을 연다.
export type CollectorSetupReason = "unreachable" | "outdated" | "no_chrome";
export const COLLECTOR_SETUP_EVENT = "neodio:collector-setup";

export interface CollectorSetupDetail {
  reason: CollectorSetupReason;
  status: CollectorAgentStatus | null;
}

/** 수집기가 이 작업(minVersion 이상 필요)을 받을 준비가 됐는지 — 아니면 이유. */
export function agentReadiness(status: CollectorAgentStatus | null, minVersion: string): CollectorSetupReason | null {
  if (!status) return "unreachable";
  if (compareVersions(status.version, minVersion) < 0) return "outdated";
  if (!status.chrome) return "no_chrome";
  return null;
}

export function openCollectorSetup(detail: CollectorSetupDetail) {
  window.dispatchEvent(new CustomEvent<CollectorSetupDetail>(COLLECTOR_SETUP_EVENT, { detail }));
}
