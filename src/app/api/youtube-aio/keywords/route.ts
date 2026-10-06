import { NextRequest, NextResponse } from "next/server";
import { AIO_KEYWORD_GROUPS, addAioKeywords, archiveAioKeyword } from "@/lib/backend/aio/store";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { AioKeywordGroup } from "@/lib/db";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";

const MAX_KEYWORDS_PER_REQUEST = 200;

// YouTube AIO 인용 페이지의 "프롬프트 추가" — 줄바꿈으로 여러 개를 한 번에.
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  // 그룹은 이제 선택 사항이다(프롬프트 라이브러리에는 그룹이 없다) — 보내면 예전처럼 검색 의도/토픽으로 옮긴다.
  const group = body?.group as AioKeywordGroup | undefined;
  const keywords: string[] = typeof body?.keywords === "string" ? body.keywords.split(/\r?\n/) : [];

  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if (group !== undefined && !AIO_KEYWORD_GROUPS.includes(group)) {
    return NextResponse.json({ error: "키워드 그룹이 올바르지 않습니다." }, { status: 400 });
  }
  const cleaned = keywords.map((k) => k.trim()).filter(Boolean);
  if (cleaned.length === 0) return NextResponse.json({ error: "프롬프트를 입력하세요." }, { status: 400 });
  if (cleaned.length > MAX_KEYWORDS_PER_REQUEST) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_KEYWORDS_PER_REQUEST}개까지 추가할 수 있습니다.` }, { status: 400 });
  }
  if (cleaned.some((k) => k.length > 200)) {
    return NextResponse.json({ error: "프롬프트는 200자 이하여야 합니다." }, { status: 400 });
  }

  const added = await addAioKeywords(brandId, cleaned, group);
  return NextResponse.json({ added });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const brandId = request.nextUrl.searchParams.get("brandId");
  const id = request.nextUrl.searchParams.get("id");
  if (!brandId || !id) return NextResponse.json({ error: "brandId와 id가 필요합니다." }, { status: 400 });
  await archiveAioKeyword(brandId, id);
  return NextResponse.json({ ok: true });
}
