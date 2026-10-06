import { NextRequest, NextResponse } from "next/server";
import { addWorkLog, deleteWorkLog } from "@/lib/backend/aio/store";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";

// 키워드 상세의 "이 영상의 최적화 작업 이력" — 작업일(자막·챕터·설명란 등)을
// 기록해 두면 첫 인용일과 나란히 보여 준다.
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const videoId = typeof body?.videoId === "string" ? body.videoId : "";
  const workDate = typeof body?.workDate === "string" ? body.workDate : "";
  const workType = typeof body?.workType === "string" ? body.workType.trim() : "";
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!/^[\w-]{11}$/.test(videoId)) return NextResponse.json({ error: "영상 ID가 올바르지 않습니다." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return NextResponse.json({ error: "작업일을 입력하세요." }, { status: 400 });
  if (!workType || workType.length > 100) return NextResponse.json({ error: "작업 내용을 100자 이내로 입력하세요." }, { status: 400 });

  await addWorkLog(brandId, { videoId, workDate, workType, note });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const brandId = request.nextUrl.searchParams.get("brandId");
  const id = request.nextUrl.searchParams.get("id");
  if (!brandId || !id) return NextResponse.json({ error: "brandId와 id가 필요합니다." }, { status: 400 });
  await deleteWorkLog(brandId, id);
  return NextResponse.json({ ok: true });
}
