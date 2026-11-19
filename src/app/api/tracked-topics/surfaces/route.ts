import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { normalizeSurfaces } from "@/lib/promptSurfaces";
import { guardApi } from "@/lib/backend/auth/guard";

const MAX_ROWS = 25;

// 프롬프트 라이브러리에서 고른 여러 프롬프트의 플랫폼을 한 번에 같은 값으로 바꾼다.
// 플랫폼이 바뀌면 AIO 수집 대상(aio_keywords)도 함께 맞춰진다(store.setTrackingSurfaces).
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string") : [];
  const surfaces = normalizeSurfaces(body?.surfaces);
  if (ids.length === 0) return NextResponse.json({ error: "프롬프트를 선택하세요." }, { status: 400 });
  if (ids.length > MAX_ROWS) return NextResponse.json({ error: `한 번에 최대 ${MAX_ROWS}개까지 바꿀 수 있습니다.` }, { status: 400 });
  if (surfaces.length === 0) return NextResponse.json({ error: "수집할 플랫폼을 하나 이상 선택하세요." }, { status: 400 });

  const store = await getPromptStore();
  const changedIds: string[] = [];
  try {
    for (const id of new Set(ids)) {
      if (await store.setTrackingSurfaces(tenant.orgId, id, surfaces)) changedIds.push(id);
    }
  } catch (error) {
    console.error("Bulk platform update failed", error);
    return NextResponse.json({ changed: changedIds.length, ids: changedIds,
      error: "플랫폼 변경이 중단됐습니다. 변경된 항목은 유지됩니다. 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ changed: changedIds.length, ids: changedIds });
}
