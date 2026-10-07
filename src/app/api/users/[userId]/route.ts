import { NextRequest, NextResponse } from "next/server";
import { requireUserManager } from "@/lib/backend/auth/guard";
import { AuthError } from "@/lib/backend/auth/authStore";
import { getUserDetail, updateUser, type UserUpdate } from "@/lib/backend/auth/userAdminStore";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireUserManager();
  if ("denied" in gate) return gate.denied;
  const detail = await getUserDetail(gate.principal, (await params).userId);
  return detail ? NextResponse.json({ user: detail }) : NextResponse.json({ error: "유저를 찾을 수 없어요." }, { status: 404 });
}

// 수정 — action: profile(이름·상태) | setMembership(조직 할당·역할) | setBrands(브랜드 할당) | reissuePassword(임시 비밀번호)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireUserManager();
  if ("denied" in gate) return gate.denied;
  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as UserUpdate | null;
  if (!body || typeof body !== "object" || !("action" in body)) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  try {
    const result = await updateUser(gate.principal, userId, body);
    const user = await getUserDetail(gate.principal, userId);
    return NextResponse.json({ ...result, user });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "denied" ? 403 : error.code === "not_found" ? 404 : error.code === "exists" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
