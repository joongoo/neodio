// 형식 자동 감지(명세 §4): 앞부분 표본으로 각 어댑터를 시험해 가장 잘 읽히는 형식을 제안한다.
// 확신이 낮으면 확정하지 않고 사용자 확인을 요구한다. 지원하지 않는 형식에서는 조용히 추측하지 않는다.
import { createApacheCombinedAdapter, createCloudflareAdapter, createCsvAdapter, detectDelimiter, parseCsvRow, suggestCsvMapping, vercelAdapter, type CsvMapping } from "./adapters";
import type { FormatId, LineAdapter, ParseFailReason } from "./types";

export const DETECT_CONFIDENCE_THRESHOLD = 0.8;

export interface FormatCandidate {
  format: FormatId;
  /** 표본 줄 중 이 형식으로 읽힌 비율(0~1) */
  successRate: number;
  failureReasons: Partial<Record<ParseFailReason, number>>;
}

export type DetectResult =
  | {
      status: "detected";
      format: FormatId;
      confidence: number;
      /** true면 화면에서 사용자가 형식을 확인해야 한다 */
      needsUserConfirmation: boolean;
      /** 시각에 시간대가 없어 사용자가 시간대를 알려 줘야 한다(추측하지 않는다) */
      needsTimezone?: boolean;
      candidates: FormatCandidate[];
      csv?: { delimiter: string; mapping: CsvMapping; missing: string[]; hasHeader: true };
    }
  | { status: "unsupported-no-user-agent"; message: string; candidates: FormatCandidate[] }
  | { status: "unknown"; message: string; candidates: FormatCandidate[] };

function score(adapter: LineAdapter, lines: string[]): FormatCandidate {
  let ok = 0;
  const failureReasons: Partial<Record<ParseFailReason, number>> = {};
  for (const line of lines) {
    const r = adapter.parseLine(line);
    if (r.ok) ok++;
    else failureReasons[r.reason] = (failureReasons[r.reason] ?? 0) + 1;
  }
  // 요청 로그가 아닌 줄(예: Vercel 빌드 로그)은 형식이 틀렸다는 증거가 아니므로 분모에서 뺀다
  const notApplicable = failureReasons["not-applicable"] ?? 0;
  const considered = lines.length - notApplicable;
  return { format: adapter.id, successRate: considered > 0 ? ok / considered : 0, failureReasons };
}

export function detectFormat(sampleLines: string[], options: { assumeOffsetMinutes?: number } = {}): DetectResult {
  const lines = sampleLines.map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { status: "unknown", message: "표본 줄이 없습니다.", candidates: [] };

  const candidates: FormatCandidate[] = [
    score(createApacheCombinedAdapter(options.assumeOffsetMinutes), lines),
    score(createCloudflareAdapter(options.assumeOffsetMinutes), lines),
    score(vercelAdapter, lines),
  ];

  // CSV: 첫 줄을 헤더로 보고 필수 열이 모두 매핑되는지, 나머지 줄이 읽히는지 본다
  const header = lines[0];
  const delimiter = detectDelimiter(header);
  const headerCells = parseCsvRow(header, delimiter);
  let csvInfo: { delimiter: string; mapping: CsvMapping; missing: string[]; hasHeader: true } | undefined;
  if (headerCells.length >= 4 && !header.trimStart().startsWith("{")) {
    const { mapping, missing } = suggestCsvMapping(headerCells);
    csvInfo = { delimiter, mapping, missing, hasHeader: true };
    if (missing.length === 0) candidates.push(score(createCsvAdapter(mapping, { delimiter, assumeOffsetMinutes: options.assumeOffsetMinutes }), lines.slice(1)));
  }

  candidates.sort((a, b) => b.successRate - a.successRate);
  const best = candidates[0];

  // combined 정규식은 맞는데 UA가 없는 줄이 대부분이면 common 형식이다 → 분류 불가를 알리고 중단
  const combined = candidates.find((c) => c.format === "apache-combined");
  if (combined && (combined.failureReasons["no-user-agent"] ?? 0) / lines.length >= 0.5) {
    return {
      status: "unsupported-no-user-agent",
      message: "User-Agent가 없는 로그 형식(common)으로 보입니다. UA가 포함된 combined 형식으로 내보내 주세요.",
      candidates,
    };
  }

  // 형식은 맞는데 시각에 시간대가 없는 경우: 형식은 알려 주되 시간대를 물어야 한다
  const tz = candidates.find((c) => (c.failureReasons["time-needs-timezone"] ?? 0) / lines.length >= 0.5);
  if (tz && best.successRate < DETECT_CONFIDENCE_THRESHOLD) {
    return {
      status: "detected",
      format: tz.format,
      confidence: tz.successRate + (tz.failureReasons["time-needs-timezone"] ?? 0) / lines.length,
      needsUserConfirmation: true,
      needsTimezone: true,
      candidates,
      csv: tz.format === "csv" ? csvInfo : undefined,
    };
  }

  if (best.successRate === 0) {
    return { status: "unknown", message: "지원하는 형식으로 읽히는 줄이 없습니다. 열 매핑을 직접 지정하거나 형식을 확인해 주세요.", candidates };
  }

  return {
    status: "detected",
    format: best.format,
    confidence: best.successRate,
    needsUserConfirmation: best.successRate < DETECT_CONFIDENCE_THRESHOLD || best.format === "csv",
    candidates,
    csv: best.format === "csv" ? csvInfo : undefined,
  };
}
