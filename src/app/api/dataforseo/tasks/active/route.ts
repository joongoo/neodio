import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { SERP_API_SURFACES, type SerpApiSurface } from "@/lib/dataforseoPricing";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const brandId = request.nextUrl.searchParams.get("brandId") ?? "";
  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }

  const tasks = await new PostgresProviderTaskStore().listActive(tenant.orgId, brandId, { manualOnly: true });
  return NextResponse.json({
    tasks: tasks.map((task) => ({
      id: task.id,
      surface: task.surface,
      scheduledWindow: task.scheduledWindow,
    })),
  });
}

const SURFACES = new Set<string>(SERP_API_SURFACES);
const MAX_PROMPTS = 1_000;

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const rawPrompts: unknown[] = Array.isArray(body?.prompts) ? body.prompts : [];
  const surfaces = Array.isArray(body?.surfaces)
    ? [...new Set(body.surfaces.filter((surface: unknown): surface is SerpApiSurface => typeof surface === "string" && SURFACES.has(surface)))]
    : [];

  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if (rawPrompts.length === 0 || rawPrompts.length > MAX_PROMPTS || surfaces.length === 0) {
    return NextResponse.json({ error: `최대 ${MAX_PROMPTS}개의 프롬프트와 하나 이상의 SERP API 엔진이 필요합니다.` }, { status: 400 });
  }

  const promptIds = new Set<string>();
  const queries = new Set<string>();
  for (const item of rawPrompts) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    if (typeof value.promptId === "string" && value.promptId) promptIds.add(value.promptId);
    if (typeof value.query === "string" && value.query.trim()) queries.add(value.query.trim());
  }
  if (promptIds.size === 0 && queries.size === 0) {
    return NextResponse.json({ error: "유효한 프롬프트가 필요합니다." }, { status: 400 });
  }

  const surfaceSet = new Set(surfaces);
  const tasks = (await new PostgresProviderTaskStore().listActive(tenant.orgId, brandId))
    .filter((task) => surfaceSet.has(task.surface) && (
      (task.promptId !== null && promptIds.has(task.promptId)) || queries.has(task.querySnapshot)
    ));

  return NextResponse.json({
    tasks: tasks.map((task) => ({
      id: task.id,
      promptId: task.promptId,
      query: task.querySnapshot,
      surface: task.surface,
      device: task.device,
      status: task.status,
      startedAt: task.createdAt,
      scheduledWindow: task.scheduledWindow,
    })),
  });
}
