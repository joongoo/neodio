import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { normalizeSurfaces } from "@/lib/promptSurfaces";

const MAX_ROWS = 300;

// 프롬프트 라이브러리에서 고른 여러 프롬프트의 수집 표면을 한 번에 같은 값으로 바꾼다.
// 표면이 바뀌면 AIO 수집 대상(aio_keywords)도 함께 맞춰진다(store.setTrackingSurfaces).
export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string") : [];
  const surfaces = normalizeSurfaces(body?.surfaces);
  if (ids.length === 0) return NextResponse.json({ error: "프롬프트를 선택하세요." }, { status: 400 });
  if (ids.length > MAX_ROWS) return NextResponse.json({ error: `한 번에 최대 ${MAX_ROWS}개까지 바꿀 수 있습니다.` }, { status: 400 });
  if (surfaces.length === 0) return NextResponse.json({ error: "수집할 표면을 하나 이상 선택하세요." }, { status: 400 });

  const store = await getPromptStore();
  let changed = 0;
  for (const id of new Set(ids)) {
    if (await store.setTrackingSurfaces(tenant.orgId, id, surfaces)) changed += 1;
  }
  return NextResponse.json({ changed });
}
