export interface CollectionDuration {
  hasItems: boolean;
  finished: boolean;
  startedAt: string | null;
  completedAt: string | null;
  measuredAt: string;
}

export function collectionDurationLabel(timing?: CollectionDuration): string {
  if (!timing?.hasItems) return "-";
  if (!timing.startedAt) return timing.finished ? "기록 없음" : "시작 대기";
  if (timing.finished && !timing.completedAt) return "기록 없음";
  const ms = Date.parse(timing.completedAt ?? timing.measuredAt) - Date.parse(timing.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "기록 없음";
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  const text = [hours ? `${hours}시간` : "", minutes ? `${minutes}분` : "", `${seconds % 60}초`].filter(Boolean).join(" ");
  return timing.finished ? text : `${text} (진행 중)`;
}
