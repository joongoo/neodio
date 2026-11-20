import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getPromptStore } from "@/lib/backend/database";
import { getBrandAioSettings } from "@/lib/backend/brandAioConfig";
import { registerLegacyRequest, type LegacyPlannedItem } from "@/lib/backend/dataforseo/legacyRequest";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (!tenant.brandId || typeof body?.requestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.requestId) || !Array.isArray(body.items) || !body.items.length || body.items.length > 2000) {
    return NextResponse.json({ error: "수집 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const db = await getPromptStore();
  const items: LegacyPlannedItem[] = [];
  const devices = (await getBrandAioSettings(tenant.brandId)).devices;
  for (const item of body.items) {
    if (!item || typeof item.query !== "string" || !["google-aio", "google-ai-mode", "naver-aio", "naver-ai", "gemini"].includes(item.surface)) {
      return NextResponse.json({ error: "수집 항목이 올바르지 않습니다." }, { status: 400 });
    }
    const [prompt] = await db.query<{ id: string; text: string }>(`SELECT p.id,p.text FROM prompts p JOIN prompt_tracking t ON t.organization_id=p.organization_id AND t.prompt_id=p.id
      WHERE p.organization_id=$1 AND t.brand_id=$2 AND t.status='active' AND p.text=$3 LIMIT 1`, [tenant.orgId, tenant.brandId, item.query]);
    if (!prompt) return NextResponse.json({ error: "수집할 프롬프트를 찾을 수 없습니다." }, { status: 404 });
    for (const device of item.surface === "google-aio" ? devices : ["desktop"]) items.push({ query: prompt.text, promptId: prompt.id, surface: item.surface, device });
  }
  return NextResponse.json(await registerLegacyRequest(tenant.orgId, tenant.brandId, body.requestId, (await getCurrentUser())?.id ?? null, items));
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const step = body?.step;
  if (!step || typeof step.requestId !== "string" || !["ai", "aio", "gemini"].includes(step.kind) || !["waiting", "running", "done", "error", "stopped"].includes(body.phase)) {
    return NextResponse.json({ error: "진행 상태 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const surfaces = step.kind === "aio" ? ["google-aio"] : step.kind === "gemini" ? ["gemini"] :
    (Array.isArray(step.engines) ? step.engines : []).map((engine: string) => engine === "naver" ? "naver-ai" : engine === "naver-overview" ? "naver-aio" : "google-ai-mode");
  const identities = step.kind === "aio" ? step.promptIds : step.keywords;
  if (!Array.isArray(identities) || identities.length > 2000 || identities.some(value => typeof value !== "string")) return NextResponse.json({ error: "항목 형식이 올바르지 않습니다." }, { status: 400 });
  const phase = body.phase;
  const now = new Date().toISOString();
  const state = phase === "waiting" ? "reserved" : phase === "running" ? "collecting" : phase === "stopped" ? "cancelled" : "parse_failed";
  await (await getPromptStore()).query(`UPDATE legacy_collection_items i SET status=$1,
    submitted_at=CASE WHEN $1='reserved' THEN submitted_at ELSE COALESCE(submitted_at,$2) END,completed_at=CASE WHEN $1 IN ('reserved','collecting') THEN NULL ELSE $2 END,
    error_message=CASE WHEN $1='collecting' THEN NULL ELSE $3 END
    FROM collection_requests r WHERE r.id=i.collection_request_id AND r.client_request_id=$4
      AND r.organization_id=$5 AND r.brand_id=$6 AND i.run_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM gemini_collection_queue q WHERE q.item_id=i.id)
      AND (NOT r.cancel_requested OR $1 NOT IN ('reserved','collecting'))
      AND i.surface=ANY($7::text[]) AND (${step.kind === "aio" ? "i.prompt_id" : "i.query_snapshot"}=ANY($8::text[]))
      AND i.status=ANY($9::text[])`,
  [state, now, typeof body.note === "string" ? body.note.slice(0, 2000) : "수집 결과가 반영되지 않았습니다.", step.requestId, tenant.orgId, tenant.brandId, surfaces, identities,
    phase === "running" || phase === "waiting" ? ["reserved"] : ["reserved", "collecting"]]);
  return NextResponse.json({ updated: true });
}
