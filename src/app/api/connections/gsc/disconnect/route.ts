import { NextRequest, NextResponse } from "next/server";
import { deleteGscToken } from "@/lib/backend/gscTokenStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { guardApi } from "@/lib/backend/auth/guard";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const form = await request.formData();
  const brandId = form.get("brandId");
  if (typeof brandId !== "string" || !brandId) {
    return NextResponse.json({ error: "brandId가 필요합니다." }, { status: 400 });
  }
  const tenant = await getCurrentTenant();
  if (!(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "이 조직의 브랜드가 아닙니다." }, { status: 404 });
  }
  await deleteGscToken(brandId);
  // POST 요청의 기본 리다이렉트(307)는 메서드를 그대로 유지해서 대상
  // 페이지 라우트에 POST로 다시 요청하게 된다 — 303으로 강제해야 GET으로
  // 이동한다. 이게 없어서 "연결 해제" 버튼이 안 되던 원인.
  return NextResponse.redirect(new URL(`${tenant.base}/brands-management/${brandId}/connections`, request.url), 303);
}
