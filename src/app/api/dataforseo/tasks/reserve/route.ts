import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getBrandAioSettings } from "@/lib/backend/brandAioConfig";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getPromptStore } from "@/lib/backend/database";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { SERP_API_SURFACES, type SerpApiSurface } from "@/lib/dataforseoPricing";
import type { AioDevice } from "@/lib/db/types";

const REQUEST_ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const SURFACES = new Set<string>(SERP_API_SURFACES);

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
  const rawPrompts = Array.isArray(body?.prompts) ? body.prompts.slice(0, 200) : [];

  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!surface || !requestId || rawPrompts.length === 0) {
    return NextResponse.json({ error: "surface, requestId, prompts가 필요합니다." }, { status: 400 });
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
  const taskStore = new PostgresProviderTaskStore();
  const tasks = [];
  for (const prompt of canonical) {
    for (const device of devices) {
      const result = await taskStore.reserve({
        organizationId: tenant.orgId,
        brandId,
        promptId: prompt.promptId ?? null,
        query: prompt.query,
        surface,
        device,
        marketId: "market-kr",
        scheduledWindow: `manual:${requestId}`,
      });
      tasks.push({ id: result.task.id, status: result.task.status, created: result.created, estimatedCostUsd: result.task.estimatedCostUsd });
    }
  }

  return NextResponse.json({
    reserved: tasks.length,
    created: tasks.filter((task) => task.created).length,
    estimatedCostUsd: tasks.reduce((sum, task) => sum + task.estimatedCostUsd, 0),
    networkCalls: 0,
    tasks,
  });
}
