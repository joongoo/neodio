import { getPromptStore } from "./database";
import type { PromptStore } from "./database/store";
import type { ManagedBrand, AioVideoWorkLog } from "../db/types";
import type { PromptSurface } from "../promptSurfaces";
import { buildCitationDetail } from "../citationDetail";
import { citationVideoId, type CitationObservation, type CitationVideoMeta } from "../citationMetrics";
import { buildJudgeContext, classifyWebSource } from "./aio/judge";
import { citationPeriod, loadCitationDetail, readCitationObservations } from "./citationOverview";
import { supportsCitationDevices } from "../citationDevices";

export async function loadCitationDetailPage(org: string, brand: Pick<ManagedBrand, "id" | "url" | "urls" | "otherBrands">, engine: PromptSurface, runId: string, now = new Date(), db?: Pick<PromptStore, "query">) {
  db ??= await getPromptStore();
  const snapshot = await loadCitationDetail(org, brand.id, engine, runId, db);
  if (!snapshot) return null;
  const outcome = snapshot.rawMetadata.observationOutcome;
  const selected: CitationObservation = { id: runId, promptId: snapshot.promptId, query: snapshot.rawMetadata.query ?? "", runAt: snapshot.runAt, status: snapshot.status, device: snapshot.device,
    webSearch: engine === "gemini" ? snapshot.rawMetadata.webSearch ?? null : true,
    answerPresent: outcome === "ai_absent" ? false : outcome === "ai_answered" || snapshot.rawResponse.trim() ? true : null, citations: snapshot.rawMetadata.citations ?? [] };
  const period = citationPeriod("4w", now);
  const [recent, channels] = await Promise.all([
    readCitationObservations(org, brand.id, engine, period, db),
    db.query<{ channel_id: string }>("SELECT c.channel_id FROM brand_youtube_channels c JOIN brands b ON b.id=c.brand_id WHERE c.brand_id=$2 AND b.organization_id=$1", [org, brand.id]),
  ]);
  const ids = [...new Set([...recent, selected].flatMap(o => o.citations.map(c => citationVideoId(c.url)).filter((id): id is string => !!id)))];
  const videos = ids.length ? await db.query<CitationVideoMeta>(`SELECT video_id AS "videoId",channel_id AS "channelId",title,channel_title AS "channelTitle" FROM youtube_videos WHERE video_id=ANY($1)`, [ids]) : [];
  const context = buildJudgeContext(brand, channels.map(c => c.channel_id));
  const deviceRecent = supportsCitationDevices(engine) ? recent.filter(o => (o.device ?? null) === snapshot.device) : recent;
  const detail = buildCitationDetail(selected, deviceRecent, videos, channels.map(c => c.channel_id), citationPeriod("2w", now).dates, url => {
    const type = classifyWebSource(url, context);
    return type === "other" ? "web" : type;
  });
  const ownIds = detail.ownVideos.map(v => v.videoId);
  const workLogs = ownIds.length ? await db.query<AioVideoWorkLog>(`SELECT id,video_id AS "videoId",work_date AS "workDate",work_type AS "workType",note FROM aio_video_work_logs WHERE brand_id=$1 AND video_id=ANY($2) ORDER BY work_date DESC,id`, [brand.id, ownIds]) : [];
  return { snapshot, ...detail, workLogs, channelCount: channels.length };
}

export type CitationDetailPageData = NonNullable<Awaited<ReturnType<typeof loadCitationDetailPage>>>;
