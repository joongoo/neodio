// Client-safe (no node:child_process) — "지금 수집" 버튼과 진행 모달이
// 쓰는 작업 상태 타입. 실행기는 aio/jobRunner.ts.
import { AioDevice, AioObservationStatus } from "@/lib/db/types";

export type AioJobStatus = "running" | "done" | "captcha" | "cancelled" | "error";

export interface AioJobResult {
  keyword: string;
  device: AioDevice;
  status: AioObservationStatus;
  captcha: boolean;
  sources: number;
  youtube: number;
  ownPositions: number[];
  message: string | null;
}

export interface AioCollectJob {
  id: string;
  brandId: string;
  /** "전체 키워드" 또는 키워드 이름 */
  label: string;
  status: AioJobStatus;
  total: number;
  current: { keyword: string; device: AioDevice } | null;
  /** 다음 키워드까지 대기 중이면 대기가 끝나는 시각(ms) */
  waitUntil: number | null;
  results: AioJobResult[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}
