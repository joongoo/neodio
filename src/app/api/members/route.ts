import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { AuthError, assignMember, listMembers, removeMember } from "@/lib/backend/auth/authStore";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import type { OrgRole } from "@/lib/auth/permissions";

// 조직 구성원 관리 — 오너·직원만. 구성원 목록, 가입한 사용자에게 역할·브랜드 할당, 변경, 제거.
const isRole = (value: unknown): value is OrgRole => value === "admin" || value === "viewer";
const brandIdsOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    const status = error.code === "not_found" ? 404 : error.code === "denied" ? 403 : error.code === "exists" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  throw error;
}

export async function GET() {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const store = await getPromptStore();
  const brands = (await store.listBrands(tenant.orgId)).map((b) => ({ id: b.id, name: b.name }));
  return NextResponse.json({ members: await listMembers(tenant.orgId), brands });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (!isRole(body?.role)) return NextResponse.json({ error: "역할은 admin 또는 viewer여야 해요." }, { status: 400 });
  try {
    const member = await assignMember(tenant.orgId, { loginId: String(body?.loginId ?? ""), role: body.role, brandIds: brandIdsOf(body?.brandIds) }, (await getCurrentUser())?.id ?? null);
    return NextResponse.json({ member });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const actor = (await getCurrentUser())?.id ?? null;
  const current = (await listMembers(tenant.orgId)).find((m) => m.userId === userId);
  if (!current) return NextResponse.json({ error: "구성원을 찾을 수 없어요." }, { status: 404 });
  try {
    if (body?.role !== undefined && !isRole(body.role)) return NextResponse.json({ error: "역할은 admin 또는 viewer여야 해요." }, { status: 400 });
    const role = isRole(body?.role) ? body.role : current.role;
    const brandIds = body?.brandIds !== undefined ? brandIdsOf(body.brandIds) : current.brandIds;
    return NextResponse.json({ member: await assignMember(tenant.orgId, { loginId: current.loginId, role, brandIds }, actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi("manageOrg");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  try {
    await removeMember(tenant.orgId, userId, (await getCurrentUser())?.id ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
