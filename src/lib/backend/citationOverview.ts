import { getPromptStore } from "./database";
import type { PromptStore } from "./database/store";
import type { PromptSurface } from "../promptSurfaces";
import type { ManagedBrand, PromptRunSeed } from "../db/types";
import { buildCitationOverview, citationDate, citationVideoId, type CitationObservation, type CitationVideoMeta } from "../citationMetrics";
import { buildJudgeContext, classifyWebSource } from "./aio/judge";

type Reader = Pick<PromptStore, "query">;
const models: Record<PromptSurface, string> = { "google-aio": "model-google-aio", gemini: "model-gemini-25", "google-ai-mode": "model-google-ai-overview", "naver-aio": "model-naver-overview", "naver-ai": "model-naver-ai-search" };
const sources: Record<PromptSurface, string> = { "google-aio": "google-aio", gemini: "api", "google-ai-mode": "google-ai-overview", "naver-aio": "naver-overview", "naver-ai": "naver-ai-search" };

// A shared prompt or similar text never establishes ownership of a run.
const runScope = `r.organization_id=$1 AND r.model_id=$3 AND r.platform=$4 AND (
  EXISTS (SELECT 1 FROM legacy_collection_items i JOIN collection_requests c ON c.id=i.collection_request_id
    WHERE i.run_id=r.id AND i.organization_id=$1 AND i.brand_id=$2 AND i.surface=$5 AND c.organization_id=$1 AND c.brand_id=$2)
  OR EXISTS (SELECT 1 FROM provider_tasks t WHERE t.id=r.provider_task_id AND t.organization_id=$1 AND t.brand_id=$2 AND t.surface=$5)
  OR EXISTS (SELECT 1 FROM collection_jobs j WHERE j.id=r.job_id AND j.organization_id=$1 AND j.data_json->>'brandId'=$2))`;
const aioScope = `o.brand_id=$2 AND b.organization_id=$1 AND k.brand_id=o.brand_id`;
const rawCitations = `CASE WHEN jsonb_typeof(r.original_json->'rawMetadata'->'citations')='array' THEN r.original_json->'rawMetadata'->'citations' ELSE '[]'::jsonb END`;
const aioCitations = `coalesce((SELECT jsonb_agg(jsonb_build_object('url',c.url,'title',c.title,'domain',c.domain,'isOwnDomain',false,'channelId',c.channel_id) ORDER BY c.position) FROM aio_citations c WHERE c.observation_id=o.id),'[]'::jsonb)`;

export function citationPeriod(range: string | undefined, now = new Date()) {
  const days = range === "1w" ? 7 : range === "2w" ? 14 : range === "12w" ? 84 : 28;
  const today = citationDate(now.toISOString());
  const end = new Date(`${today}T00:00:00+09:00`);
  const dates = Array.from({ length: days }, (_, i) => citationDate(new Date(end.getTime() - (days - 1 - i) * 86400000).toISOString()));
  return { range: days === 7 ? "1w" : days === 14 ? "2w" : days === 84 ? "12w" : "4w", dates,
    from: new Date(`${dates[0]}T00:00:00+09:00`).toISOString(), to: new Date(end.getTime() + 86400000).toISOString() };
}

function values(org: string, brand: string, engine: PromptSurface) { return [org, brand, models[engine], sources[engine], engine]; }

export async function readCitationObservations(org: string, brand: string, engine: PromptSurface, period: ReturnType<typeof citationPeriod>, db: Reader): Promise<CitationObservation[]> {
  if (engine === "google-aio") {
    // The original dashboard owns these observations, including historical
    // collections that predate request IDs. Do not re-add their prompt_runs copies.
    return db.query<CitationObservation>(`SELECT DISTINCT ON (coalesce(k.prompt_id,k.id),o.collected_date,(o.status<>'failed'))
      'aio:'||o.id AS id,coalesce(k.prompt_id,k.id) AS "promptId",coalesce(p.text,k.keyword) AS query,o.collected_at AS "runAt",
      CASE WHEN o.status='failed' THEN 'failed' ELSE 'success' END AS status,true AS "webSearch",
      CASE WHEN o.status='aio_present' THEN true WHEN o.status='aio_absent' THEN false ELSE NULL END AS "answerPresent",${aioCitations} AS citations
      FROM aio_observations o JOIN brands b ON b.id=o.brand_id JOIN aio_keywords k ON k.id=o.keyword_id
      LEFT JOIN prompts p ON p.id=k.prompt_id AND p.organization_id=$1
      WHERE ${aioScope} AND k.status='active' AND o.collected_at >= $3 AND o.collected_at < $4
      ORDER BY coalesce(k.prompt_id,k.id),o.collected_date,(o.status<>'failed'),o.collected_at DESC,o.id DESC`, [org, brand, period.from, period.to]);
  }
  return db.query<CitationObservation>(`SELECT DISTINCT ON (r.prompt_id,(r.run_at::timestamptz AT TIME ZONE 'Asia/Seoul')::date,(r.status='success'))
    r.id,r.prompt_id AS "promptId",r.prompt_text_snapshot AS query,r.run_at AS "runAt",r.status,
    CASE WHEN $5='gemini' THEN CASE r.original_json->'rawMetadata'->>'webSearch' WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END ELSE true END AS "webSearch",
    CASE WHEN r.observation_outcome='ai_absent' THEN false WHEN r.observation_outcome='ai_answered' OR length(trim(r.raw_response))>0 THEN true ELSE NULL END AS "answerPresent",
    ${rawCitations} AS citations FROM prompt_runs r WHERE ${runScope} AND r.run_at >= $6 AND r.run_at < $7
    ORDER BY r.prompt_id,(r.run_at::timestamptz AT TIME ZONE 'Asia/Seoul')::date,(r.status='success'),r.run_at DESC,r.id DESC`, [...values(org, brand, engine), period.from, period.to]);
}

export async function loadCitationOverview(org: string, brand: Pick<ManagedBrand, "id" | "url" | "urls" | "otherBrands">, engine: PromptSurface, period: ReturnType<typeof citationPeriod>, db?: Reader) {
  db ??= await getPromptStore();
  const [observations, channels, trackedRows] = await Promise.all([
    readCitationObservations(org, brand.id, engine, period, db),
    db.query<{ channel_id: string }>("SELECT c.channel_id FROM brand_youtube_channels c JOIN brands b ON b.id=c.brand_id WHERE c.brand_id=$2 AND b.organization_id=$1", [org, brand.id]),
    db.query<{ id: string; query: string }>(`SELECT DISTINCT p.id,p.text AS query FROM prompt_tracking t
      JOIN prompts p ON p.id=t.prompt_id AND p.organization_id=t.organization_id
      JOIN prompt_tracking_surfaces s ON s.tracking_id=t.id WHERE t.organization_id=$1 AND t.brand_id=$2 AND t.status='active' AND s.surface=$3
      UNION SELECT coalesce(k.prompt_id,k.id),coalesce(p.text,k.keyword) FROM aio_keywords k JOIN brands b ON b.id=k.brand_id
      LEFT JOIN prompts p ON p.id=k.prompt_id AND p.organization_id=$1 WHERE $3='google-aio' AND k.brand_id=$2 AND b.organization_id=$1 AND k.status='active'`, [org, brand.id, engine]),
  ]);
  const tracked = [...new Map(trackedRows.map(p => [p.id, p])).values()];
  const ids = [...new Set(observations.flatMap(o => o.citations.map(c => citationVideoId(c.url)).filter((id): id is string => !!id)))];
  const videos = ids.length ? await db.query<CitationVideoMeta>(`SELECT video_id AS "videoId",channel_id AS "channelId",title,channel_title AS "channelTitle" FROM youtube_videos WHERE video_id=ANY($1)`, [ids]) : [];
  const context = buildJudgeContext(brand, channels.map(c => c.channel_id));
  const classify = (url: string) => {
    const type = classifyWebSource(url, context);
    return type === "other" ? "web" as const : type;
  };
  return { ...buildCitationOverview(observations, videos, channels.map(c => c.channel_id), period.dates, tracked, classify), channelCount: channels.length };
}

export async function loadCitationDetail(org: string, brand: string, engine: PromptSurface, id: string, db?: Reader): Promise<PromptRunSeed | null> {
  db ??= await getPromptStore();
  if (engine === "google-aio") {
    if (!id.startsWith("aio:")) return null;
    const [o] = await db.query<{ id: string; promptId: string; query: string; runAt: string; status: string; text: string | null; citations: PromptRunSeed["rawMetadata"]["citations"] }>(`SELECT o.id,coalesce(k.prompt_id,k.id) AS "promptId",coalesce(p.text,k.keyword) AS query,o.collected_at AS "runAt",o.status,o.aio_text AS text,${aioCitations} AS citations
      FROM aio_observations o JOIN brands b ON b.id=o.brand_id JOIN aio_keywords k ON k.id=o.keyword_id LEFT JOIN prompts p ON p.id=k.prompt_id AND p.organization_id=$1
      WHERE ${aioScope} AND o.id=$3`, [org, brand, id.slice(4)]);
    return o ? { id, promptId: o.promptId, llmModelId: models[engine], marketId: "market-kr", runAt: o.runAt, status: o.status === "failed" ? "failed" : "success", rawResponse: o.text ?? "",
      rawMetadata: { source: "google-aio", query: o.query, citations: o.citations, observationOutcome: o.status === "aio_absent" ? "ai_absent" : o.status === "failed" ? "collection_error" : "ai_answered" } } : null;
  }
  const [row] = await db.query<{ original_json: PromptRunSeed; prompt_id: string; prompt_text_snapshot: string; run_at: string; status: PromptRunSeed["status"]; raw_response: string; observation_outcome: PromptRunSeed["rawMetadata"]["observationOutcome"] }>(`SELECT r.original_json,r.prompt_id,r.prompt_text_snapshot,r.run_at,r.status,r.raw_response,r.observation_outcome FROM prompt_runs r WHERE ${runScope} AND r.id=$6`, [...values(org, brand, engine), id]);
  return row ? { ...row.original_json, id, promptId: row.prompt_id, runAt: row.run_at, status: row.status, rawResponse: row.raw_response,
    rawMetadata: { ...row.original_json.rawMetadata, query: row.prompt_text_snapshot, observationOutcome: row.observation_outcome ?? row.original_json.rawMetadata.observationOutcome } } : null;
}
