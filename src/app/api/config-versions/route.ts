import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";

// 이름 붙인 설정 버전 — 목록 조회와 저장(저장 시점의 프롬프트 세트·토픽 묶음·브랜드 설정 전체를 함께 보관).
export async function GET() {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const store = await getPromptStore();
  return NextResponse.json({ versions: await store.listConfigVersions(tenant.orgId, tenant.brandId || undefined) });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label : "";
  const note = typeof body?.note === "string" ? body.note : undefined;
  if (!label.trim()) return NextResponse.json({ error: "버전 이름을 입력해주세요." }, { status: 400 });
  const tenant = await getCurrentTenant();
  const store = await getPromptStore();
  try {
    const version = await store.createConfigVersion(tenant.orgId, { brandId: tenant.brandId || undefined, label, note });
    return NextResponse.json({ version });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 400 });
  }
}
