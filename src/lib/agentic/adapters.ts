// 로그 형식 어댑터(명세 §4): 한 줄을 NormalizedEvent로 바꾼다. 조용히 추측하지 않고, 못 바꾸면 이유를 돌려준다.
import { kindOfPath, normalizeHost, normalizePath, parseClfTime, parseFlexibleTime } from "./normalize";
import type { LineAdapter, NormalizedEvent, ParseOutcome } from "./types";

function fail(reason: Extract<ParseOutcome, { ok: false }>["reason"], detail?: string): ParseOutcome {
  return { ok: false, reason, detail };
}

function toStatus(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{3}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
}

function buildEvent(p: { timeMs: number; host?: string; rawPath: string; status: number; method?: string; ua: string; ip?: string; extra?: Record<string, string> }): ParseOutcome {
  const path = normalizePath(p.rawPath);
  const event: NormalizedEvent = {
    timeMs: p.timeMs,
    host: p.host ? normalizeHost(p.host) : undefined,
    path,
    status: p.status,
    method: (p.method ?? "UNKNOWN").toUpperCase(),
    ua: p.ua,
    ip: p.ip && p.ip !== "-" ? p.ip : undefined,
    kind: kindOfPath(path),
    extra: p.extra,
  };
  return { ok: true, event };
}

// ── Apache/Nginx combined ───────────────────────────────────────────────
// IP ident user [time] "METHOD target PROTO" status bytes "referer" "user-agent"
// 따옴표 안에 이스케이프된 따옴표(\")가 올 수 있어 [^"\\]|\\. 로 읽는다.
const QUOTED = '"((?:[^"\\\\]|\\\\.)*)"';
const COMBINED = new RegExp(`^(\\S+) \\S+ \\S+ \\[([^\\]]+)\\] ${QUOTED} (\\d{3}|-) (\\S+)(?: ${QUOTED} ${QUOTED})?`);

// 캡처 그룹: 1 IP, 2 시각, 3 요청줄, 4 상태, 5 크기, 6 리퍼러, 7 UA (6·7은 common 형식에서는 없음)
export function createApacheCombinedAdapter(assumeOffsetMinutes?: number): LineAdapter {
  return {
    id: "apache-combined",
    parseLine(line) {
      const m = COMBINED.exec(line);
      if (!m) return fail("malformed");
      // common 형식(리퍼러·UA 없음)은 UA가 없어 분류할 수 없다
      if (m[7] === undefined) return fail("no-user-agent");
      const time = parseClfTime(m[2], assumeOffsetMinutes);
      if (!time.ok) return fail(time.reason, m[2]);
      const request = m[3].split(" ");
      // 잘못된 요청은 요청줄이 "-" 이거나 이상한 바이트로 기록된다
      if (request.length < 2 || !/^[A-Za-z]+$/.test(request[0])) return fail("malformed", "request line");
      const status = toStatus(m[4]);
      if (status === null) return fail("bad-status", m[4]);
      return buildEvent({ timeMs: time.ms, rawPath: request[1], status, method: request[0], ua: m[7].replace(/\\"/g, '"'), ip: m[1] });
    },
  };
}

/** 시간대를 가정하지 않는 기본 어댑터: 시각에 오프셋이 있는 일반적인 로그용 */
export const apacheCombinedAdapter: LineAdapter = createApacheCombinedAdapter();

// ── Cloudflare Logpush (http_requests) NDJSON ───────────────────────────
// 문서로 확인한 필드: ClientRequestUserAgent, ClientIP, ClientRequestHost, ClientRequestPath, EdgeResponseStatus, EdgeStartTimestamp, VerifiedBotCategory
// ClientRequestMethod는 이번 조사에서 직접 확인하지 못했다 — 있으면 쓰고 없으면 UNKNOWN.
function parseJsonObject(line: string): Record<string, unknown> | null {
  const text = line.trim();
  if (!text.startsWith("{")) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createCloudflareAdapter(assumeOffsetMinutes?: number): LineAdapter {
  return {
    id: "cloudflare-logpush",
    parseLine(line) {
      const o = parseJsonObject(line);
      if (!o) return fail("malformed");
      if (!("ClientRequestUserAgent" in o) && !("EdgeStartTimestamp" in o)) return fail("malformed", "not a Cloudflare http_requests row");
      const ua = o.ClientRequestUserAgent;
      if (typeof ua !== "string") return fail("no-user-agent");
      const rawTime = o.EdgeStartTimestamp;
      if (typeof rawTime !== "string" && typeof rawTime !== "number") return fail("bad-time");
      const time = parseFlexibleTime(rawTime, assumeOffsetMinutes);
      if (!time.ok) return fail(time.reason);
      const status = toStatus(o.EdgeResponseStatus);
      if (status === null) return fail("bad-status");
      if (typeof o.ClientRequestPath !== "string") return fail("malformed", "ClientRequestPath");
      const extra: Record<string, string> = {};
      if (typeof o.VerifiedBotCategory === "string" && o.VerifiedBotCategory !== "") extra.cloudflareVerifiedBotCategory = o.VerifiedBotCategory;
      return buildEvent({
        timeMs: time.ms,
        host: typeof o.ClientRequestHost === "string" ? o.ClientRequestHost : undefined,
        rawPath: o.ClientRequestPath,
        status,
        method: typeof o.ClientRequestMethod === "string" ? o.ClientRequestMethod : undefined,
        ua,
        ip: typeof o.ClientIP === "string" ? o.ClientIP : undefined,
        extra: Object.keys(extra).length ? extra : undefined,
      });
    },
  };
}

// ── Vercel Log Drain NDJSON ─────────────────────────────────────────────
// 문서로 확인한 필드: proxy.{timestamp, method, host, path, userAgent[], statusCode, clientIp}, host, timestamp
// proxy 객체가 없는 줄(빌드 로그 등)은 요청 로그가 아니므로 건너뛴다. statusCode -1은 백그라운드 재검증.
export const vercelAdapter: LineAdapter = {
  id: "vercel-log-drain",
  parseLine(line) {
    const o = parseJsonObject(line);
    if (!o) return fail("malformed");
    const proxy = o.proxy;
    if (typeof proxy !== "object" || proxy === null || Array.isArray(proxy)) return fail("not-applicable", "no proxy object");
    const p = proxy as Record<string, unknown>;
    const uaList = p.userAgent;
    const ua = Array.isArray(uaList) ? uaList[0] : typeof uaList === "string" ? uaList : undefined;
    if (typeof ua !== "string") return fail("no-user-agent");
    if (p.statusCode === -1) return fail("revalidation");
    const status = toStatus(p.statusCode);
    if (status === null) return fail("bad-status");
    const rawTime = typeof p.timestamp === "number" || typeof p.timestamp === "string" ? p.timestamp : o.timestamp;
    if (typeof rawTime !== "number" && typeof rawTime !== "string") return fail("bad-time");
    const time = parseFlexibleTime(rawTime);
    if (!time.ok) return fail(time.reason);
    if (typeof p.path !== "string") return fail("malformed", "proxy.path");
    return buildEvent({
      timeMs: time.ms,
      host: typeof p.host === "string" ? p.host : typeof o.host === "string" ? o.host : undefined,
      rawPath: p.path,
      status,
      method: typeof p.method === "string" ? p.method : undefined,
      ua,
      ip: typeof p.clientIp === "string" ? p.clientIp : undefined,
    });
  },
};

/** 파일 전체가 JSON 배열인 경우(Vercel 등) 각 원소를 한 줄 JSON으로 풀어 준다. 배열이 아니면 null. */
export function splitJsonArrayRecords(text: string): string[] | null {
  const head = text.trimStart();
  if (!head.startsWith("[")) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v.map((x) => JSON.stringify(x)) : null;
  } catch {
    return null;
  }
}

// ── CSV/TSV ─────────────────────────────────────────────────────────────
export type CsvField = "time" | "host" | "path" | "status" | "ua" | "ip" | "method";
export type CsvMapping = Partial<Record<CsvField, number>>;

const HEADER_SYNONYMS: Record<CsvField, string[]> = {
  time: ["time", "timestamp", "date", "datetime", "@timestamp", "requestedat", "edgestarttimestamp", "starttime"],
  host: ["host", "hostname", "domain", "clientrequesthost", "cs-host", "servername"],
  path: ["path", "uri", "url", "requestpath", "request_path", "cs-uri-stem", "clientrequestpath", "requesturi", "request_uri"],
  status: ["status", "statuscode", "status_code", "sc-status", "edgeresponsestatus", "responsestatus"],
  ua: ["useragent", "user_agent", "user-agent", "ua", "cs(user-agent)", "clientrequestuseragent", "http_user_agent"],
  ip: ["ip", "clientip", "client_ip", "remote_addr", "c-ip", "remoteip", "clientaddress"],
  method: ["method", "cs-method", "clientrequestmethod", "request_method", "httpmethod"],
};

const REQUIRED_CSV_FIELDS: CsvField[] = ["time", "path", "status", "ua"];

export function parseCsvRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

export function detectDelimiter(headerLine: string): string {
  const counts: Array<[string, number]> = [",", "\t", ";", "|"].map((d) => [d, parseCsvRow(headerLine, d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

/** 헤더 이름으로 열 매핑을 제안한다. 필수 열(시각·경로·상태·UA)이 빠지면 missing에 담아 사용자 지정을 요구한다. */
export function suggestCsvMapping(headerCells: string[]): { mapping: CsvMapping; missing: CsvField[] } {
  const norm = headerCells.map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const mapping: CsvMapping = {};
  (Object.keys(HEADER_SYNONYMS) as CsvField[]).forEach((field) => {
    const idx = norm.findIndex((h) => HEADER_SYNONYMS[field].indexOf(h) >= 0);
    if (idx >= 0) mapping[field] = idx;
  });
  return { mapping, missing: REQUIRED_CSV_FIELDS.filter((f) => mapping[f] === undefined) };
}

export function createCsvAdapter(mapping: CsvMapping, options: { delimiter?: string; assumeOffsetMinutes?: number } = {}): LineAdapter {
  const delimiter = options.delimiter ?? ",";
  return {
    id: "csv",
    parseLine(line) {
      const cells = parseCsvRow(line, delimiter);
      const get = (f: CsvField): string | undefined => (mapping[f] === undefined ? undefined : cells[mapping[f] as number]);
      const rawTime = get("time");
      const ua = get("ua");
      const rawPath = get("path");
      const rawStatus = get("status");
      if (rawTime === undefined || ua === undefined || rawPath === undefined || rawStatus === undefined) return fail("malformed", "missing mapped columns");
      const time = parseFlexibleTime(rawTime.trim(), options.assumeOffsetMinutes);
      if (!time.ok) return fail(time.reason, rawTime);
      const status = toStatus(rawStatus);
      if (status === null) return fail("bad-status", rawStatus);
      return buildEvent({ timeMs: time.ms, host: get("host"), rawPath, status, method: get("method"), ua, ip: get("ip") });
    },
  };
}
