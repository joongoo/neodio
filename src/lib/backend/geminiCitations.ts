import { getPromptStore } from "./database";
import type { PromptRunSeed } from "@/lib/db/types";
import type { PromptStore } from "./database/store";
import { buildGeminiOverview, geminiDate, geminiVideoId, type GeminiObservation, type GeminiVideoMeta } from "../geminiCitationMetrics";

type Reader = Pick<PromptStore, "query">;

// Only explicit collection ownership establishes brand membership. Prompt text
// and current tracking membership cannot establish who owned an old run.
const scope = `r.organization_id=$1 AND r.model_id='model-gemini-25'
  AND EXISTS (SELECT 1 FROM legacy_collection_items i
    JOIN collection_requests c ON c.id=i.collection_request_id
    WHERE i.run_id=r.id AND i.organization_id=$1 AND i.brand_id=$2
      AND c.organization_id=$1 AND c.brand_id=$2)`;

export interface GeminiCitationRow {
  id: string;
  query: string;
  runAt: string;
  status: string;
  citationCount: number;
  webSearch: boolean | null;
}

export async function loadGeminiCitations(orgId: string, brandId: string, query: string, requestedPage: number, db?: Reader) {
  db ??= await getPromptStore();
  const values = [orgId, brandId, query];
  const filter = `${scope} AND ($3='' OR strpos(lower(r.prompt_text_snapshot),lower($3))>0)`;
  const [count] = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM prompt_runs r WHERE ${filter}`, values);
  const total = count?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const rows = await db.query<GeminiCitationRow>(`SELECT r.id,r.prompt_text_snapshot AS query,r.run_at AS "runAt",r.status,
    CASE WHEN jsonb_typeof(r.original_json->'rawMetadata'->'citations')='array'
      THEN jsonb_array_length(r.original_json->'rawMetadata'->'citations') ELSE 0 END AS "citationCount",
    CASE r.original_json->'rawMetadata'->>'webSearch' WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END AS "webSearch"
    FROM prompt_runs r WHERE ${filter} ORDER BY r.run_at DESC,r.id DESC LIMIT 25 OFFSET $4`, [...values, (page - 1) * 25]);
  return { rows, total, page, pageCount };
}

export async function loadGeminiCitationDetail(orgId: string, brandId: string, runId: string, db?: Reader) {
  db ??= await getPromptStore();
  const [row] = await db.query<{ original_json: PromptRunSeed }>(`SELECT r.original_json FROM prompt_runs r WHERE ${scope} AND r.id=$3`, [orgId, brandId, runId]);
  return row?.original_json ?? null;
}

export function geminiPeriod(range: string | undefined, now = new Date()) {
  const days = range === "1w" ? 7 : range === "2w" ? 14 : range === "12w" ? 84 : 28;
  const today = geminiDate(now.toISOString());
  const end = new Date(`${today}T00:00:00+09:00`);
  const dates = Array.from({ length: days }, (_, i) => geminiDate(new Date(end.getTime() - (days - 1 - i) * 86400000).toISOString()));
  return { range: days === 7 ? "1w" : days === 14 ? "2w" : days === 84 ? "12w" : "4w", dates,
    from: new Date(`${dates[0]}T00:00:00+09:00`).toISOString(), to: new Date(end.getTime() + 86400000).toISOString() };
}

export async function loadGeminiOverview(orgId: string, brandId: string, period: ReturnType<typeof geminiPeriod>, db?: Reader) {
  db ??= await getPromptStore();
  // Keep the latest collection per prompt and KST day. No answer bodies or
  // provider calls are needed for the dashboard, and repeat runs cannot skew rates.
  const observations = await db.query<GeminiObservation>(`SELECT DISTINCT ON (r.prompt_id,(r.run_at::timestamptz AT TIME ZONE 'Asia/Seoul')::date)
    r.id,r.prompt_id AS "promptId",r.prompt_text_snapshot AS query,r.run_at AS "runAt",r.status,
    CASE r.original_json->'rawMetadata'->>'webSearch' WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END AS "webSearch",
    CASE WHEN jsonb_typeof(r.original_json->'rawMetadata'->'citations')='array' THEN r.original_json->'rawMetadata'->'citations' ELSE '[]'::jsonb END AS citations
    FROM prompt_runs r WHERE ${scope} AND r.run_at >= $3 AND r.run_at < $4
    ORDER BY r.prompt_id,(r.run_at::timestamptz AT TIME ZONE 'Asia/Seoul')::date,r.run_at DESC,r.id DESC`, [orgId, brandId, period.from, period.to]);
  const ids = [...new Set(observations.flatMap(o => o.citations.map(c => geminiVideoId(c.url)).filter((id): id is string => id !== null)))];
  const [channels, videos] = await Promise.all([
    db.query<{ channel_id: string }>("SELECT channel_id FROM brand_youtube_channels WHERE brand_id=$1", [brandId]),
    ids.length ? db.query<GeminiVideoMeta>(`SELECT video_id AS "videoId",channel_id AS "channelId",title,channel_title AS "channelTitle" FROM youtube_videos WHERE video_id=ANY($1)`, [ids]) : Promise.resolve([]),
  ]);
  return { ...buildGeminiOverview(observations, videos, channels.map(c => c.channel_id), period.dates), channelCount: channels.length };
}

export function safeCitationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
