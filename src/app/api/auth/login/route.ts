import { NextRequest, NextResponse } from "next/server";
import { createSession, normalizeEmail, principalFor, verifyLogin } from "@/lib/backend/auth/authStore";
import { setSessionCookie } from "@/lib/backend/auth/session";
import { checkAllowed, clearFailures, registerFailure } from "@/lib/backend/auth/throttleStore";
import { isPending } from "@/lib/auth/permissions";
import { clientIp, EMAIL_POLICY, IP_POLICY, throttleMessage } from "@/lib/auth/throttle";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(String(body?.email ?? ""));
  // 무차별 대입 방지 — 이메일(그 계정을 겨눈 시도)과 IP(여러 계정을 훑는 시도)를 따로 센다.
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${clientIp(request.headers)}`;
  const gate = await checkAllowed([emailKey, ipKey]);
  if (gate.blocked) {
    return NextResponse.json({ error: throttleMessage(gate.retryAfterSec) }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });
  }

  const user = await verifyLogin(email, String(body?.password ?? ""));
  // 이메일이 없는지 비밀번호가 틀렸는지는 알려주지 않는다.
  if (!user) {
    await Promise.all([registerFailure(emailKey, EMAIL_POLICY), registerFailure(ipKey, IP_POLICY)]);
    return NextResponse.json({ error: "이메일 또는 비밀번호가 맞지 않아요." }, { status: 401 });
  }
  await clearFailures(emailKey);
  const session = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
  const response = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword, pending: isPending(await principalFor(user)) });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
