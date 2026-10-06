import { NextRequest, NextResponse } from "next/server";
import { AuthError, changePassword } from "@/lib/backend/auth/authStore";
import { currentSessionToken, getCurrentUser } from "@/lib/backend/auth/session";

// 비밀번호 변경 — 로그인한 본인이 현재 비밀번호를 입력해야 바꿀 수 있다(이메일 재설정은 없다). 다른 기기의 로그인은 끊긴다.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    await changePassword(user.id, String(body?.current ?? ""), String(body?.next ?? ""), await currentSessionToken());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === "denied" ? 403 : 400 });
    throw error;
  }
}
