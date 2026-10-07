import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/backend/auth/authStore";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { updateOwnName } from "@/lib/backend/auth/userAdminStore";

// 내 정보 수정(이름) — 로그인한 본인만. 이메일은 로그인 ID라 바꾸지 못한다.
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json({ name: await updateOwnName(user.id, String(body?.name ?? "")) });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
