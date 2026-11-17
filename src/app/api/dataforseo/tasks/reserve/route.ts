import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getBrandAioSettings } from "@/lib/backend/brandAioConfig";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getPromptStore } from "@/lib/backend/database";
import { CollectionQueueService } from "@/lib/backend/dataforseo/collectionQueue";
import { providerTaskWakeSeed, publishDataForSeoWake } from "@/lib/backend/dataforseo/queueWake";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { SERP_API_SURFACES, type SerpApiSurface } from "@/lib/dataforseoPricing";
import type { AioDevice } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const REQUEST_ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const SURFACES = new Set<string>(SERP_API_SURFACES);
const MAX_PROMPTS = 200;

type RequestedPrompt = { promptId?: string; query: string };

// This route intentionally reserves local DB tasks only. Provider POST remains behind
// the separate DATAFORSEO_ENABLED gate and is not invoked from prompt-library selection.
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const surface = typeof body?.surface === "string" && SURFACES.has(body.surface) ? body.surface as SerpApiSurface : null;
  const requestId = typeof body?.requestId === "string" && REQUEST_ID.test(body.requestId) ? body.requestId : null;
  const force = body?.force === true;
  const rawPrompts = Array.isArray(body?.prompts) ? body.prompts : [];

  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!surface || !requestId || rawPrompts.length === 0) {
    return NextResponse.json({ error: "surface, requestId, prompts가 필요합니다." }, { status: 400 });
  }

  if (rawPrompts.length > MAX_PROMPTS) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_PROMPTS}개의 프롬프트를 예약할 수 있습니다.` }, { status: 400 });
  }

  const requested: RequestedPrompt[] = rawPrompts
    .map((item: unknown) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        promptId: typeof value.promptId === "string" ? value.promptId : undefined,
        query: typeof value.query === "string" ? value.query.trim() : "",
      };
    })
    .filter((item: RequestedPrompt) => item.query.length > 0 && item.query.length <= 500);
  if (requested.length !== rawPrompts.length) {
    return NextResponse.json({ error: "유효하지 않은 프롬프트가 포함되어 있습니다." }, { status: 400 });
  }

  const store = await getPromptStore();
  const canonical: RequestedPrompt[] = [];
  for (const item of requested) {
    if (!item.promptId) {
      canonical.push(item);
      continue;
    }
    const [row] = await store.query<{ id: string; text: string }>(
      `SELECT p.id,p.text FROM prompts p
       JOIN prompt_tracking t ON t.organization_id=p.organization_id AND t.prompt_id=p.id
       WHERE p.organization_id=$1 AND p.id=$2 AND t.brand_id=$3 AND t.status='active' LIMIT 1`,
      [tenant.orgId, item.promptId, brandId],
    );
    if (!row) return NextResponse.json({ error: "수집할 프롬프트를 찾을 수 없습니다." }, { status: 404 });
    canonical.push({ promptId: row.id, query: row.text });
  }

  const devices: AioDevice[] = surface === "google-aio"
    ? (await getBrandAioSettings(brandId)).devices
    : ["desktop"];
  const queued = await new CollectionQueueService().appendApproved({
    organizationId: tenant.orgId,
    brandId,
    requestedBy: (await getCurrentUser())?.id ?? null,
    clientRequestId: requestId,
    requestKind: "manual",
    reuseActive: !force,
    tasks: canonical.flatMap((prompt) => devices.map((device) => ({
      promptId: prompt.promptId ?? null,
      query: prompt.query,
      surface,
      device,
      marketId: "market-kr",
      scheduledWindow: `manual:${requestId}`,
    }))),
  });
  const tasks = queued.reservations.map((result) => {
    return {
      id: result.task.id,
      status: result.task.status,
      created: result.created,
      promptId: result.task.promptId,
      query: result.task.querySnapshot,
      surface: result.task.surface,
      device: result.task.device,
      estimatedCostUsd: result.task.estimatedCostUsd,
    };
  });
  const wake = tasks.length > 0
    ? await publishDataForSeoWake({
        version: 1,
        organizationId: tenant.orgId,
        brandId,
        clientRequestId: requestId,
        idempotencySeed: providerTaskWakeSeed(tasks.map((task) => task.id)),
      })
    : { published: false, messageId: null };

  return NextResponse.json({
    collectionRequestId: queued.request?.id ?? null,
    reserved: tasks.length,
    created: tasks.filter((task) => task.created).length,
    alreadyActive: tasks.filter((task) => !task.created).length,
    estimatedCostUsd: tasks.filter((task) => task.created).reduce((sum, task) => sum + task.estimatedCostUsd, 0),
    networkCalls: 0,
    queueWakePublished: wake.published,
    tasks,
  });
}
