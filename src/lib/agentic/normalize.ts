// 호스트·경로·시각 정규화와 요청 종류 판별(명세 §5). 어댑터들이 공통으로 쓴다.
import type { PathKind } from "./types";

const MAX_PATH_LENGTH = 2048;

export function normalizeHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[")) return host; // IPv6 리터럴은 그대로
  host = host.replace(/:[0-9]{1,5}$/, "");
  return host.replace(/\.$/, "");
}

/**
 * 경로를 집계 키로 쓸 수 있게 정규화한다.
 * - 쿼리·프래그먼트 제거(개인정보·토큰 유출 방지)
 * - 절대 URL이 들어오면 경로만 취함
 * - 구간별 퍼센트 디코딩(구분자로 쓰이는 문자는 다시 인코딩해 구조를 바꾸지 않음)
 * - 연속 슬래시 정리, 루트 외 끝 슬래시 제거
 */
export function normalizePath(raw: string): string {
  let text = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const afterScheme = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    // 권한부(호스트)는 첫 "/" "?" "#" 앞까지다. "?"나 "#"가 먼저 나오면 경로가 없는 URL이고,
    // 그 뒤에 슬래시가 있어도 쿼리·프래그먼트의 일부이지 경로가 아니다.
    const end = afterScheme.search(/[/?#]/);
    text = end >= 0 && afterScheme[end] === "/" ? afterScheme.slice(end) : "/";
  }
  const cut = text.search(/[?#]/);
  if (cut >= 0) text = text.slice(0, cut);
  if (!text.startsWith("/")) text = `/${text}`;
  const segments = text.split("/").filter((s, i) => i === 0 || s !== "");
  const decoded = segments.map((seg) => {
    try {
      const d = decodeURIComponent(seg);
      return d.indexOf("/") >= 0 ? encodeURIComponent(d) : d;
    } catch {
      return seg; // 깨진 인코딩은 그대로 둔다
    }
  });
  let out = decoded.join("/");
  if (out === "") out = "/";
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out.length > MAX_PATH_LENGTH ? out.slice(0, MAX_PATH_LENGTH) : out;
}

const ASSET_EXT = new Set([
  "js", "mjs", "css", "map", "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp",
  "woff", "woff2", "ttf", "otf", "eot", "mp4", "webm", "mp3", "wav", "ogg",
]);
const PAGE_EXT = new Set(["html", "htm", "php", "asp", "aspx", "jsp", "shtml"]);

export function kindOfPath(path: string): PathKind {
  const lower = path.toLowerCase();
  if (lower === "/robots.txt") return "robots";
  if (lower === "/llms.txt" || lower === "/llms-full.txt") return "llms";
  if (/\/sitemap[^/]*\.xml(\.gz)?$/.test(lower)) return "sitemap";
  const last = lower.slice(lower.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot < 0) return "page"; // 확장자 없음 = 페이지로 추정
  const ext = last.slice(dot + 1);
  if (ASSET_EXT.has(ext)) return "asset";
  if (PAGE_EXT.has(ext)) return "page";
  return "other";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 식별자처럼 보이는 구간을 ":id"로 가린다(선택). 연도·월 같은 짧은 숫자는 그대로 둔다. */
export function maskIdSegments(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (UUID.test(seg)) return ":id";
      if (/^[0-9]{5,}$/.test(seg)) return ":id";
      if (/^[0-9a-f]{12,}$/i.test(seg) && /[0-9]/.test(seg)) return ":id";
      return seg;
    })
    .join("/");
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export type TimeParse = { ok: true; ms: number } | { ok: false; reason: "bad-time" | "time-needs-timezone" };

/**
 * Apache/Nginx 시각 "05/Nov/2026:09:12:44 +0900" → UTC epoch ms.
 * 오프셋이 없는 형식("05/Nov/2026:09:12:44")은 추측하지 않고 time-needs-timezone을 돌려준다
 * (사용자가 assumeOffsetMinutes로 시간대를 알려 줄 때만 해석).
 */
export function parseClfTime(text: string, assumeOffsetMinutes?: number): TimeParse {
  const m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?: ([+-])(\d{2})(\d{2}))?$/.exec(text.trim());
  if (!m) return { ok: false, reason: "bad-time" };
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return { ok: false, reason: "bad-time" };
  const [day, year, hh, mm, ss] = [Number(m[1]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])];
  if (day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 60) return { ok: false, reason: "bad-time" };
  let offsetMin: number;
  if (m[7] !== undefined) offsetMin = (m[7] === "-" ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
  else if (assumeOffsetMinutes !== undefined) offsetMin = assumeOffsetMinutes;
  else return { ok: false, reason: "time-needs-timezone" };
  return { ok: true, ms: Date.UTC(year, month, day, hh, mm, ss) - offsetMin * 60_000 };
}

/**
 * 범용 시각 해석: 숫자(초·밀리초·마이크로초·나노초 자릿수로 구분) 또는 ISO 8601.
 * 시간대가 없는 ISO는 assumeOffsetMinutes가 있을 때만 해석한다(추측 금지, 명세 §5).
 */
export function parseFlexibleTime(value: string | number, assumeOffsetMinutes?: number): TimeParse {
  if (typeof value === "number" || /^\d{9,19}$/.test(String(value).trim())) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "bad-time" };
    let ms: number;
    if (n >= 1e17) ms = n / 1e6; // 나노초
    else if (n >= 1e14) ms = n / 1e3; // 마이크로초
    else if (n >= 1e11) ms = n; // 밀리초
    else ms = n * 1000; // 초
    return { ok: true, ms: Math.floor(ms) };
  }
  const text = String(value).trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
  // 소수 초는 3자리까지만 남긴다(엔진별 파싱 차이 회피)
  const trimmed = text.replace(/(\.\d{3})\d+/, "$1");
  const iso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?/.test(trimmed);
  if (!iso) return { ok: false, reason: "bad-time" };
  const normalized = trimmed.replace(" ", "T");
  if (hasZone) {
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? { ok: false, reason: "bad-time" } : { ok: true, ms };
  }
  if (assumeOffsetMinutes === undefined) return { ok: false, reason: "time-needs-timezone" };
  const ms = Date.parse(`${normalized}Z`);
  return Number.isNaN(ms) ? { ok: false, reason: "bad-time" } : { ok: true, ms: ms - assumeOffsetMinutes * 60_000 };
}
