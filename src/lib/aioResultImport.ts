import type { AioParagraph } from "@/lib/db/types";
import type { CollectedSource } from "@/lib/backend/aio/judge";

// 수집기가 사용자 PC에서 검색한 AI Overview 결과를 서버가 받을 때의 검증 — 브라우저가 올리는 값이라 믿지 않고
// 모양을 다시 만든다(허용한 필드만, 길이·개수 제한). 화면 캡처·HTML 경로는 그 PC의 것이라 받지 않는다.
// 순수 함수라 서버 API와 테스트가 같이 쓴다.
export interface SanitizedAioResult {
  status: "aio_present" | "aio_absent" | "failed";
  errorKind?: "captcha" | "error";
  errorMessage?: string;
  collectedAt: string;
  aioText: string | null;
  paragraphs: AioParagraph[];
  sources: CollectedSource[];
}

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 10 * 60 * 1000;
const isPosition = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000;

export function sanitizeAioResult(input: unknown, now = Date.now()): SanitizedAioResult | null {
  const r = input as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  if (r.status !== "aio_present" && r.status !== "aio_absent" && r.status !== "failed") return null;

  // 수집일이 같은 날의 기존 결과를 덮어쓰므로, 최근에 수집한 값만 받는다.
  const collected = typeof r.collectedAt === "string" ? new Date(r.collectedAt).getTime() : NaN;
  if (Number.isNaN(collected) || collected < now - MAX_AGE_MS || collected > now + MAX_FUTURE_MS) return null;

  const sources: CollectedSource[] = [];
  // 원본은 300개까지만 훑고, 유효한 출처를 100개까지 담는다.
  for (const item of Array.isArray(r.sources) ? r.sources.slice(0, 300) : []) {
    if (sources.length >= 100) break;
    const s = item as Record<string, unknown> | null;
    if (!s || !isPosition(s.position) || typeof s.url !== "string" || !/^https?:\/\//i.test(s.url) || s.url.length > 2048) continue;
    sources.push({
      position: s.position,
      title: typeof s.title === "string" ? s.title.slice(0, 300) : "",
      url: s.url,
      domain: typeof s.domain === "string" ? s.domain.slice(0, 253) : "",
    });
  }

  const paragraphs: AioParagraph[] = [];
  for (const item of Array.isArray(r.paragraphs) ? r.paragraphs.slice(0, 300) : []) {
    const p = item as Record<string, unknown> | null;
    if (!p || typeof p.text !== "string") continue;
    paragraphs.push({
      text: p.text.slice(0, 3000),
      sources: (Array.isArray(p.sources) ? p.sources : []).filter(isPosition).slice(0, 50),
    });
  }

  return {
    status: r.status,
    ...(r.errorKind === "captcha" || r.errorKind === "error" ? { errorKind: r.errorKind } : {}),
    ...(typeof r.errorMessage === "string" && r.errorMessage ? { errorMessage: r.errorMessage.slice(0, 500) } : {}),
    collectedAt: new Date(collected).toISOString(),
    aioText: typeof r.aioText === "string" ? r.aioText.slice(0, 60_000) : null,
    paragraphs,
    sources,
  };
}
