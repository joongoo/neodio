// 에이전틱 트래픽 0단계(docs/features/traffic/agentic-traffic-spec.md) 공통 타입. 순수 타입만 둔다.

export type PathKind = "page" | "asset" | "robots" | "sitemap" | "llms" | "other";

/** 모든 로그 형식을 이 모양으로 맞춘다(명세 §5). 이후 단계는 원래 형식을 모른다. */
export interface NormalizedEvent {
  /** UTC epoch 밀리초 */
  timeMs: number;
  /** 소문자·포트 제거. 로그에 호스트 열이 없으면 undefined(사용자가 도메인을 지정) */
  host?: string;
  /** 쿼리·프래그먼트 제거, 퍼센트 인코딩 정규화 */
  path: string;
  status: number;
  /** 대문자 메서드. 형식에 없으면 "UNKNOWN" */
  method: string;
  ua: string;
  /** 분류 직후 폐기되어야 하는 값. 집계 키에는 넣지 않는다 */
  ip?: string;
  kind: PathKind;
  /** 어댑터가 보존하는 참고 값(예: Cloudflare VerifiedBotCategory). 분류에는 쓰지 않는다 */
  extra?: Record<string, string>;
}

export type ParseFailReason =
  | "malformed" // 형식에 맞지 않는 줄
  | "no-user-agent" // UA 열이 없는 형식(예: common)
  | "bad-time"
  | "time-needs-timezone" // 시간대 없는 시각 + 가정할 시간대 미지정
  | "bad-status"
  | "not-applicable" // 요청 로그가 아닌 줄(예: Vercel 빌드 로그)
  | "revalidation"; // 백그라운드 재검증 등 상태 코드가 없는 줄

export type ParseOutcome =
  | { ok: true; event: NormalizedEvent }
  | { ok: false; reason: ParseFailReason; detail?: string };

export type FormatId = "apache-combined" | "cloudflare-logpush" | "vercel-log-drain" | "csv";

export interface LineAdapter {
  id: FormatId;
  parseLine(line: string): ParseOutcome;
}

export type Purpose = "training" | "search-index" | "user-fetch" | "ads-check" | "other";

export type Authenticity = "verified" | "suspicious" | "unverifiable";

export type AuthenticityReason =
  | "ok"
  | "purpose-mismatch" // 같은 운영사의 다른 목적 목록에만 일치(검증됨으로 취급하되 표시)
  | "ip-outside-ranges"
  | "no-ip"
  | "no-range-source" // 이 봇은 공개 IP 목록이 없음(예: 네이버 검색로봇)
  | "ranges-missing"
  | "ranges-stale"
  | "ranges-schema-invalid"
  | "ranges-partial" // 일부 목록만 쓸 수 있어 "범위 밖"이라고 단정할 수 없음
  | "proxy-ip-suspected"
  // 로그가 작아 기록된 IP가 진짜 클라이언트 IP인지 알 수 없다 → "범위 밖"이라고 단정하지 않는다
  | "ip-trust-unknown";
