// 설정 변경 이력(프롬프트 세트·토픽 묶음·브랜드 설정)의 순수 로직 — 저장소(store.ts)가 쓰기 직전·직후 값을 넘기면
// 무엇이 바뀌었는지 요약하고, 같은 값이면 기록하지 않는다. 서버·클라이언트 양쪽에서 쓸 수 있다.

export type ChangeEntity = "prompt" | "tracking" | "topic_groups" | "brand" | "user";
export type ChangeOp = "create" | "update" | "delete";

export interface ChangeEntry {
  id: string;
  /** 어느 조직에도 속하지 않은 유저의 변경은 null. */
  organizationId: string | null;
  brandId: string | null;
  entityType: ChangeEntity;
  entityId: string;
  op: ChangeOp;
  summary: string;
  before: unknown;
  after: unknown;
  actorId: string | null;
  actorName: string | null;
  at: string;
}

export interface ConfigVersion {
  id: string;
  organizationId: string;
  brandId: string | null;
  version: number;
  label: string;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  /** 저장 시점의 설정 전체 — 복원·비교에 쓴다(목록 응답에는 싣지 않는다). */
  content?: ConfigSnapshot;
  /** 이 버전 저장 시점의 요약(프롬프트 수·토픽 수). */
  stats: { prompts: number; topics: number };
}

export interface ConfigSnapshot {
  prompts: { text: string; category: string; topic: string; status: string; surfaces: string[] }[];
  topicGroups: { topic: string; category?: string; prompts: string[] }[];
  brand: Record<string, unknown> | null;
}

const BRAND_FIELD_LABEL: Record<string, string> = {
  name: "이름",
  url: "URL",
  sitemapUrl: "사이트맵",
  description: "설명",
  industry: "산업",
  status: "상태",
  markets: "마켓",
  aliases: "별칭",
  otherBrands: "경쟁사·기타 브랜드",
  urls: "등록 URL",
  socialAccounts: "소셜 계정",
  earnedContentSources: "획득 콘텐츠 소스",
  cdnConnected: "CDN 연동",
  gscConnected: "GSC 연동",
  analyticsConnected: "분석 도구 연동",
};

const stable = (value: unknown) => JSON.stringify(value ?? null);

/** 바뀐 필드만 추려서 before/after로 돌려준다. 바뀐 것이 없으면 null(기록하지 않는다). */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed: string[] = [];
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(BRAND_FIELD_LABEL)) {
    if (stable(before[key]) !== stable(after[key])) {
      changed.push(key);
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return changed.length ? { changed, before: b, after: a } : null;
}

export function brandChangeSummary(changed: string[]): string {
  const labels = changed.map((key) => BRAND_FIELD_LABEL[key] ?? key);
  return `브랜드 설정 변경 — ${labels.join(", ")}`;
}

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max)}…` : text);

export function promptSummary(op: "create" | "update" | "status", text: string, detail?: string): string {
  if (op === "create") return `프롬프트 추가 — "${clip(text)}"`;
  if (op === "update") return `프롬프트 수정 — "${clip(text)}"${detail ? ` (${detail})` : ""}`;
  return `프롬프트 ${detail ?? "상태 변경"} — "${clip(text)}"`;
}

const STATUS_LABEL: Record<string, string> = { active: "재개", paused: "일시중지", archived: "보관" };
export const trackingStatusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** 프롬프트 수정에서 무엇이 바뀌었는지 짧은 문구로 — 문구/카테고리/토픽. 바뀐 것이 없으면 null. */
export function promptUpdateDetail(before: { prompt: string; category: string; topic: string }, after: { prompt: string; category: string; topic: string }): string | null {
  const parts: string[] = [];
  if (before.prompt !== after.prompt) parts.push("문구");
  if (before.category !== after.category) parts.push("카테고리");
  if (before.topic !== after.topic) parts.push("토픽");
  return parts.length ? parts.join("·") + " 변경" : null;
}

/** 토픽 묶음 변경이 실제로 달라졌는지 — 순서와 무관하게 비교한다. */
export function groupsEqual(a: { topic: string; category?: string; prompts: string[] }[], b: { topic: string; category?: string; prompts: string[] }[]): boolean {
  const canon = (groups: typeof a) =>
    groups
      .map((g) => ({ topic: g.topic, category: g.category ?? "", prompts: [...g.prompts].sort() }))
      .sort((x, y) => x.topic.localeCompare(y.topic));
  return stable(canon(a)) === stable(canon(b));
}

/** 두 설정 스냅샷의 차이(프롬프트 추가/삭제/변경 수) — 버전 비교·복원 미리보기용. */
export function diffSnapshots(from: ConfigSnapshot, to: ConfigSnapshot) {
  const key = (p: { text: string }) => p.text.trim().toLowerCase();
  const fromMap = new Map(from.prompts.map((p) => [key(p), p]));
  const toMap = new Map(to.prompts.map((p) => [key(p), p]));
  const added = to.prompts.filter((p) => !fromMap.has(key(p)));
  const removed = from.prompts.filter((p) => !toMap.has(key(p)));
  const changed = to.prompts.filter((p) => {
    const old = fromMap.get(key(p));
    return old && (old.category !== p.category || old.topic !== p.topic || old.status !== p.status || stable([...old.surfaces].sort()) !== stable([...p.surfaces].sort()));
  });
  return { added, removed, changed, brandChanged: !!diffFields(from.brand ?? {}, to.brand ?? {}), topicGroupsChanged: !groupsEqual(from.topicGroups, to.topicGroups) };
}

// ---- 유저 변경(권한 할당·프로필) ----

export const userLabel = (user: { name: string; email: string }) => `${user.name}(${user.email})`;

export interface MembershipState {
  role: string;
  /** 브랜드 이름(보기 좋게) — 순서와 무관하게 비교한다. */
  brands: string[];
}

const sameSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** 한 조직에서의 역할·브랜드 변경을 짧은 문구로. 바뀐 것이 없으면 null(기록하지 않는다). */
export function describeMembershipChange(before: MembershipState | null, after: MembershipState | null): { op: ChangeOp; text: string } | null {
  if (!before && after) return { op: "create", text: `조직에 할당 — ${after.role}${after.brands.length ? `, 브랜드 ${after.brands.length}개` : ""}` };
  if (before && !after) return { op: "delete", text: "조직에서 제거" };
  if (!before || !after) return null;
  const parts: string[] = [];
  if (before.role !== after.role) parts.push(`역할 ${before.role}→${after.role}`);
  if (!sameSet(before.brands, after.brands)) {
    const added = after.brands.filter((b) => !before.brands.includes(b));
    const removed = before.brands.filter((b) => !after.brands.includes(b));
    parts.push(`브랜드 ${[added.length ? `+${added.join(", ")}` : "", removed.length ? `−${removed.join(", ")}` : ""].filter(Boolean).join(" ")}`);
  }
  return parts.length ? { op: "update", text: parts.join(", ") } : null;
}

/** 프로필(이름·상태) 변경 — 바뀐 필드만. 바뀐 것이 없으면 null. */
export function describeProfileChange(before: { name: string; status: string }, after: { name: string; status: string }) {
  const parts: string[] = [];
  if (before.name !== after.name) parts.push("이름");
  if (before.status !== after.status) parts.push(after.status === "disabled" ? "계정 중지" : "계정 다시 사용");
  return parts.length ? parts.join("·") : null;
}
