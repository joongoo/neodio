import {
  AioChangeKind,
  AioHistoryState,
  AioKeyword,
  AioKeywordRow,
  AioObservation,
  AioOverview,
  AioRate,
  AioSourceType,
  AioTrendPoint,
} from "@/lib/db/types";
import { toUtcSundayWeekStart } from "../processing/date";

// YouTube AIO 인용 트래커 지표 — 순수 함수. 실데이터와 Demo 샘플이 같은
// 계산을 거친다(docs/youtube-aio-tracker-plan.md §2).
//
// 분모 원칙: 인용률의 분모는 "AIO가 뜬 키워드"다. 실패한 수집은
// 어디에도 세지 않는다(미측정) — 0%와 "–"를 구분하기 위해.

export const SOURCE_TYPE_ORDER: AioSourceType[] = ["own_video", "other_youtube", "own_web", "competitor", "other"];

function rate(numerator: number, denominator: number): AioRate {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const isOwn = (o: AioObservation) => o.citations.some((c) => c.sourceType === "own_video");
const hasYoutube = (o: AioObservation) => o.citations.some((c) => c.sourceType === "own_video" || c.sourceType === "other_youtube");
const ownPosition = (o: AioObservation) => {
  const own = o.citations.filter((c) => c.sourceType === "own_video");
  return own.length > 0 ? Math.min(...own.map((c) => c.position)) : null;
};

/** 관측 묶음(키워드·일 단위)의 3단 퍼널 비율. */
function funnel(observations: AioObservation[]) {
  const measured = observations.filter((o) => o.status !== "failed");
  const present = measured.filter((o) => o.status === "aio_present");
  return {
    aioExposure: rate(present.length, measured.length),
    youtubeCitation: rate(present.filter(hasYoutube).length, present.length),
    ownCitation: rate(present.filter(isOwn).length, present.length),
  };
}

/** 키워드별 최신 성공 관측(수집일 ≤ onOrBefore). */
function latestByKeyword(observations: AioObservation[], onOrBefore?: string): Map<string, AioObservation> {
  const latest = new Map<string, AioObservation>();
  for (const o of observations) {
    if (o.status === "failed") continue;
    if (onOrBefore && o.collectedDate > onOrBefore) continue;
    const current = latest.get(o.keywordId);
    if (!current || o.collectedDate > current.collectedDate || (o.collectedDate === current.collectedDate && o.collectedAt > current.collectedAt)) {
      latest.set(o.keywordId, o);
    }
  }
  return latest;
}

function changeFor(now: AioObservation, before: AioObservation | undefined): { kind: AioChangeKind; from: number | null; to: number | null } {
  const to = ownPosition(now);
  const from = before ? ownPosition(before) : null;
  if (to !== null && from === null) return { kind: "new", from, to };
  if (to === null && from !== null) return { kind: "lost", from, to };
  if (to !== null && from !== null) {
    if (to < from) return { kind: "up", from, to };
    if (to > from) return { kind: "down", from, to };
  }
  // AIO가 없는 날끼리의 비교는 "유지"가 아니라 비교할 인용이 없는 것.
  return { kind: before && now.status === "aio_present" ? "same" : "none", from, to };
}

const SOURCE_LABEL: Record<AioSourceType, string> = {
  own_video: "우리 채널 영상",
  other_youtube: "타 채널 영상",
  own_web: "자사 웹페이지",
  competitor: "경쟁사 사이트",
  other: "블로그·미디어",
};

function alternativeFor(o: AioObservation): string | null {
  if (o.status === "aio_absent") return "AI Overview 미노출 (일반 SERP만)";
  if (isOwn(o)) return null;
  const otherVideo = o.citations.find((c) => c.sourceType === "other_youtube");
  if (otherVideo) return `대신 인용: ${SOURCE_LABEL.other_youtube} · ${otherVideo.title}`;
  const first = o.citations[0];
  if (!first) return null;
  const rest = o.citations.length - 1;
  const lead = first.sourceType === "own_web" ? `${first.domain} 웹페이지만 인용 → 영상 기회` : `대신 인용: ${SOURCE_LABEL[first.sourceType]} · ${first.domain}`;
  return rest > 0 && first.sourceType !== "own_web" ? `${lead} 외 ${rest}곳` : lead;
}

export interface OverviewOptions {
  keywords: AioKeyword[];
  /** 한 디바이스의 관측만 넘긴다 — 디바이스를 섞으면 키워드·일 단위가 깨진다. */
  observations: AioObservation[];
  today: string;
  weeks: number;
  optimizationDate: string | null;
}

export function buildAioOverview({ keywords, observations, today, weeks, optimizationDate }: OverviewOptions): AioOverview {
  const keywordIds = new Set(keywords.map((k) => k.id));
  const obs = observations.filter((o) => keywordIds.has(o.keywordId));
  const latest = latestByKeyword(obs);
  const latestList = [...latest.values()];

  // KPI = 키워드별 최신 스냅샷 기준
  const present = latestList.filter((o) => o.status === "aio_present");
  const ownLatest = present.filter(isOwn);
  const allCitations = present.flatMap((o) => o.citations);
  const ownCitations = allCitations.filter((c) => c.sourceType === "own_video");
  const positions = ownLatest.map(ownPosition).filter((p): p is number => p !== null);

  // 채널 인용률 변화(%p) — 키워드·일 단위 관측으로 비교
  let before: AioObservation[];
  let after: AioObservation[];
  const basis = optimizationDate ? "optimization" : "previous_week";
  if (optimizationDate) {
    before = obs.filter((o) => o.collectedDate < optimizationDate);
    after = obs.filter((o) => o.collectedDate >= optimizationDate);
  } else {
    const weekAgo = addDays(today, -7);
    before = obs.filter((o) => o.collectedDate <= weekAgo && o.collectedDate > addDays(weekAgo, -7));
    after = obs.filter((o) => o.collectedDate > weekAgo);
  }
  const beforeRate = funnel(before).ownCitation.rate;
  const afterRate = funnel(after).ownCitation.rate;
  const pp = beforeRate !== null && afterRate !== null ? Math.round((afterRate - beforeRate) * 1000) / 10 : null;

  // 추이 — 2주 이하는 일 단위(주 단위로는 점이 1~2개뿐), 그보다 길면 주 단위
  const granularity: "day" | "week" = weeks <= 2 ? "day" : "week";
  const trend: AioTrendPoint[] = [];
  const buckets =
    granularity === "day"
      ? Array.from({ length: weeks * 7 }, (_, i) => addDays(today, -(weeks * 7 - 1 - i))).map((d) => ({ start: d, end: d }))
      : Array.from({ length: weeks }, (_, i) => addDays(toUtcSundayWeekStart(today), -7 * (weeks - 1 - i))).map((w) => ({ start: w, end: addDays(w, 6) }));
  for (const { start, end } of buckets) {
    const f = funnel(obs.filter((o) => o.collectedDate >= start && o.collectedDate <= end));
    trend.push({
      start,
      label: shortLabel(start),
      aioExposure: f.aioExposure.rate,
      youtubeCitation: f.youtubeCitation.rate,
      ownCitation: f.ownCitation.rate,
    });
  }
  const optimizationKey = optimizationDate ? (granularity === "day" ? optimizationDate : toUtcSundayWeekStart(optimizationDate)) : null;
  const optimizationPoint = optimizationKey ? trend.find((p) => p.start === optimizationKey) : undefined;

  const countByType = new Map<AioSourceType, number>();
  for (const c of allCitations) countByType.set(c.sourceType, (countByType.get(c.sourceType) ?? 0) + 1);

  const rows: AioKeywordRow[] = keywords.map((keyword) => {
    const o = latest.get(keyword.id);
    if (!o) {
      return {
        keywordId: keyword.id,
        keyword: keyword.keyword,
        group: keyword.group,
        status: "unmeasured",
        hasYoutube: null,
        hasOwn: null,
        ownPosition: null,
        sourceCount: null,
        ownVideo: null,
        alternative: null,
        change: { kind: "none", from: null, to: null },
        collectedDate: null,
      };
    }
    const presentNow = o.status === "aio_present";
    const ownCitation = o.citations.find((c) => c.sourceType === "own_video" && c.position === ownPosition(o));
    const weekEarlier = latestByKeyword(
      obs.filter((x) => x.keywordId === keyword.id),
      addDays(o.collectedDate, -7)
    ).get(keyword.id);
    return {
      keywordId: keyword.id,
      keyword: keyword.keyword,
      group: keyword.group,
      status: o.status === "aio_present" ? "aio_present" : "aio_absent",
      hasYoutube: presentNow ? hasYoutube(o) : null,
      hasOwn: presentNow ? isOwn(o) : null,
      ownPosition: ownPosition(o),
      sourceCount: presentNow ? o.citations.length : null,
      ownVideo: ownCitation?.videoId ? { videoId: ownCitation.videoId, title: ownCitation.title, startSeconds: ownCitation.startSeconds } : null,
      alternative: alternativeFor(o),
      change: changeFor(o, weekEarlier),
      collectedDate: o.collectedDate,
    };
  });

  return {
    trackedKeywords: keywords.length,
    measuredKeywords: latestList.length,
    aioExposure: rate(present.length, latestList.length),
    youtubeCitation: rate(present.filter(hasYoutube).length, present.length),
    ownCitation: rate(ownLatest.length, present.length),
    ownCitationChange: { pp, basis },
    citedOwnVideos: new Set(ownCitations.map((c) => c.videoId).filter(Boolean)).size,
    averageOwnPosition: positions.length > 0 ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
    shareOfVoice: rate(ownCitations.length, allCitations.length),
    sourceShare: SOURCE_TYPE_ORDER.map((type) => ({
      type,
      count: countByType.get(type) ?? 0,
      share: allCitations.length > 0 ? (countByType.get(type) ?? 0) / allCitations.length : 0,
    })),
    trend,
    trendGranularity: granularity,
    optimizationLabel: optimizationPoint?.label ?? null,
    rows,
    lastCollectedAt: obs.length > 0 ? obs.reduce((max, o) => (o.collectedAt > max ? o.collectedAt : max), obs[0].collectedAt) : null,
  };
}

/** 키워드 상세의 최근 N일 히스토리 (오래된 날 → 오늘). */
export function buildHistory(observations: AioObservation[], today: string, days: number): { date: string; state: AioHistoryState }[] {
  const byDate = new Map<string, AioObservation>();
  for (const o of observations) if (o.status !== "failed") byDate.set(o.collectedDate, o);
  const history: { date: string; state: AioHistoryState }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const o = byDate.get(date);
    const state: AioHistoryState = !o
      ? "unmeasured"
      : o.status === "aio_absent"
        ? "absent"
        : isOwn(o)
          ? "own"
          : hasYoutube(o)
            ? "youtube"
            : "no_youtube";
    history.push({ date, state });
  }
  return history;
}

/** 인용 유지율 — 측정된 날 중 우리 영상이 인용된 날 비율. */
export function retention(history: { state: AioHistoryState }[]): AioRate {
  const measured = history.filter((h) => h.state !== "unmeasured");
  return rate(measured.filter((h) => h.state === "own").length, measured.length);
}

export const AIO_SOURCE_LABEL = SOURCE_LABEL;
