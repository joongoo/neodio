import type { CollectorAioSpec, CollectorAioTask } from "./collectorAgent";

// AI Overview 수집 작업 입력의 검증 — 수집기(collector/agent.ts)가 브라우저 화면에서 받은 값을 믿지 않고 다시 만든다.
// 검색 사이 간격은 수집기가 하한을 강제한다: 화면(또는 누군가)이 간격을 0으로 보내 Google 캡차를 부르지 못하게.
export const MAX_AIO_TASKS = 200;
export const MIN_AIO_DELAY_MS = 20_000;
export const MAX_AIO_DELAY_MS = 600_000;
const DEFAULT_MIN_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 60_000;

export function parseAioSpec(input: unknown): CollectorAioSpec | { error: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId || brandId.length > 100) return { error: "브랜드가 올바르지 않습니다." };

  const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (rawTasks.length === 0) return { error: "수집할 키워드가 없습니다." };
  if (rawTasks.length > MAX_AIO_TASKS) return { error: `한 번에 최대 ${MAX_AIO_TASKS}건까지 수집할 수 있습니다.` };
  const tasks: CollectorAioTask[] = [];
  for (const raw of rawTasks) {
    const task = (raw ?? {}) as Record<string, unknown>;
    const keywordId = typeof task.keywordId === "string" ? task.keywordId.trim() : "";
    const keyword = typeof task.keyword === "string" ? task.keyword.trim() : "";
    if (!keywordId || keywordId.length > 100 || !keyword || keyword.length > 200) return { error: "키워드가 올바르지 않습니다." };
    if (task.device !== "mobile" && task.device !== "desktop") return { error: "디바이스가 올바르지 않습니다." };
    tasks.push({ keywordId, keyword, device: task.device });
  }

  const country = typeof body.country === "string" ? body.country.trim().toLowerCase() : "";
  const language = typeof body.language === "string" ? body.language.trim() : "";
  if (!/^[a-z]{2}$/.test(country)) return { error: "국가 코드가 올바르지 않습니다." };
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(language)) return { error: "언어 코드가 올바르지 않습니다." };

  const clamp = (value: unknown, fallback: number) => Math.max(MIN_AIO_DELAY_MS, Math.min(MAX_AIO_DELAY_MS, Math.round(Number(value)) || fallback));
  const minDelayMs = clamp(body.minDelayMs, DEFAULT_MIN_DELAY_MS);
  const maxDelayMs = Math.max(minDelayMs, clamp(body.maxDelayMs, DEFAULT_MAX_DELAY_MS));
  return { brandId, tasks, country, language, minDelayMs, maxDelayMs };
}
