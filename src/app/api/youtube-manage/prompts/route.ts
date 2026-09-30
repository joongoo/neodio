import { NextRequest, NextResponse } from "next/server";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getPromptStore } from "@/lib/backend/database";
import { getCachedVideos } from "@/lib/backend/aio/store";
import { activeVideoIds, VIDEO_SOURCE_TYPE } from "@/lib/backend/aio/videoManage";
import { normalizeSurfaces } from "@/lib/promptSurfaces";
import { MAX_PROMPT_LENGTH } from "@/lib/videoPromptSuggestion";

const MAX_PROMPTS_PER_REQUEST = 60;
const CATEGORY = "YouTube 영상";

// 예상 프롬프트를 프롬프트 라이브러리에 등록한다 — 한 곳에서만 등록하고 플랫폼은 프롬프트별 체크박스(promptSurfaces).
// 영상과의 연결은 prompt_sources(youtube-video, 영상 ID)로 남겨, 영상 상세에서 이 영상용 프롬프트를 다시 찾는다.
export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  const items: { videoId: string; text: string; surfaces: ReturnType<typeof normalizeSurfaces> }[] = [];
  for (const raw of Array.isArray(body?.prompts) ? body.prompts : []) {
    const text = typeof raw?.text === "string" ? raw.text.replace(/\s+/g, " ").trim() : "";
    const videoId = typeof raw?.videoId === "string" ? raw.videoId : "";
    if (!text || !videoId) continue;
    if (text.length > MAX_PROMPT_LENGTH) return NextResponse.json({ error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이하여야 합니다.` }, { status: 400 });
    const surfaces = normalizeSurfaces(raw?.surfaces);
    if (surfaces.length === 0) return NextResponse.json({ error: "수집할 플랫폼을 하나 이상 선택하세요." }, { status: 400 });
    items.push({ videoId, text, surfaces });
  }
  if (items.length === 0) return NextResponse.json({ error: "등록할 프롬프트가 없습니다." }, { status: 400 });
  if (items.length > MAX_PROMPTS_PER_REQUEST) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_PROMPTS_PER_REQUEST}개까지 등록할 수 있습니다.` }, { status: 400 });
  }

  // 이 브랜드의 영상에만 붙일 수 있다.
  const allowed = await activeVideoIds(brandId, items.map((item) => item.videoId));
  if (items.some((item) => !allowed.has(item.videoId))) {
    return NextResponse.json({ error: "이 브랜드의 영상이 아닙니다." }, { status: 400 });
  }
  const meta = await getCachedVideos([...allowed]);

  const store = await getPromptStore();
  for (const item of items) {
    await store.track(
      tenant.orgId,
      {
        text: item.text,
        category: CATEGORY,
        topic: (meta.get(item.videoId)?.title ?? "").slice(0, 60) || "—",
        sourceType: VIDEO_SOURCE_TYPE,
        sourceKey: item.videoId,
        generationPurpose: "YouTube 영상 예상 프롬프트",
      },
      { brandId, origin: "ai_generated", surfaces: item.surfaces }
    );
  }
  return NextResponse.json({ registered: items.length });
}
