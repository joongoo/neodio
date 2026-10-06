import { NextRequest, NextResponse } from "next/server";
import { AuthError, createSession, createUser } from "@/lib/backend/auth/authStore";
import { setSessionCookie } from "@/lib/backend/auth/session";

// 가입 — 이메일 인증 없이 계정을 만들고 바로 로그인시킨다. 권한이 없는 "대기" 상태이고, 오너·직원이 역할·브랜드를 할당해야 화면에 접근한다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  try {
    const user = await createUser({ email: String(body?.email ?? ""), name: String(body?.name ?? ""), password: String(body?.password ?? "") });
    const session = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === "exists" ? 409 : 400 });
    throw error;
  }
}
