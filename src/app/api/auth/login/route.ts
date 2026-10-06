import { NextRequest, NextResponse } from "next/server";
import { createSession, principalFor, verifyLogin } from "@/lib/backend/auth/authStore";
import { setSessionCookie } from "@/lib/backend/auth/session";
import { isPending } from "@/lib/auth/permissions";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const user = await verifyLogin(String(body?.email ?? ""), String(body?.password ?? ""));
  // 이메일이 없는지 비밀번호가 틀렸는지는 알려주지 않는다.
  if (!user) return NextResponse.json({ error: "이메일 또는 비밀번호가 맞지 않아요." }, { status: 401 });
  const session = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
  const response = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword, pending: isPending(await principalFor(user)) });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
