import { NextRequest, NextResponse } from "next/server";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { setVideosChecked } from "@/lib/backend/aio/videoManage";
import { guardApi } from "@/lib/backend/auth/guard";

const MAX_VIDEOS_PER_REQUEST = 500;

// 영상 체크 켜기·끄기 — 체크한 영상만 예상 프롬프트 생성·인용 확인의 대상이 된다.
export async function PATCH(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const videoIds: string[] = Array.isArray(body?.videoIds) ? body.videoIds.filter((id: unknown): id is string => typeof id === "string") : [];
  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if (typeof body?.checked !== "boolean" || videoIds.length === 0) {
    return NextResponse.json({ error: "videoIds와 checked가 필요합니다." }, { status: 400 });
  }
  if (videoIds.length > MAX_VIDEOS_PER_REQUEST) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_VIDEOS_PER_REQUEST}개까지 바꿀 수 있습니다.` }, { status: 400 });
  }
  return NextResponse.json({ changed: await setVideosChecked(brandId, videoIds, body.checked) });
}
