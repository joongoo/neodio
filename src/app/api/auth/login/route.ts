import { NextRequest, NextResponse } from "next/server";
import { createSession, normalizeLoginId, principalFor, verifyLogin } from "@/lib/backend/auth/authStore";
import { setSessionCookie } from "@/lib/backend/auth/session";
import { checkAllowed, clearFailures, registerFailure } from "@/lib/backend/auth/throttleStore";
import { isPending } from "@/lib/auth/permissions";
import { clientIp, LOGIN_ID_POLICY, IP_POLICY, throttleMessage } from "@/lib/auth/throttle";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const loginId = normalizeLoginId(String(body?.loginId ?? ""));
  // 무차별 대입 방지 — 아이디(그 계정을 겨눈 시도)과 IP(여러 계정을 훑는 시도)를 따로 센다.
  const idKey = `login:id:${loginId}`;
  const ipKey = `login:ip:${clientIp(request.headers)}`;
  const gate = await checkAllowed([idKey, ipKey]);
  if (gate.blocked) {
    return NextResponse.json({ error: throttleMessage(gate.retryAfterSec) }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });
  }

  const user = await verifyLogin(loginId, String(body?.password ?? ""));
  // 아이디가 없는지 비밀번호가 틀렸는지는 알려주지 않는다.
  if (!user) {
    await Promise.all([registerFailure(idKey, LOGIN_ID_POLICY), registerFailure(ipKey, IP_POLICY)]);
    return NextResponse.json({ error: "아이디 또는 비밀번호가 맞지 않아요." }, { status: 401 });
  }
  await clearFailures(idKey);
  const session = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
  const response = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword, pending: isPending(await principalFor(user)) });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
