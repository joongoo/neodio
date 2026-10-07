import { NextRequest, NextResponse } from "next/server";
import { AuthError, createSession, createUser } from "@/lib/backend/auth/authStore";
import { isSignupEnabled, setSessionCookie } from "@/lib/backend/auth/session";
import { checkAllowed, registerFailure } from "@/lib/backend/auth/throttleStore";
import { clientIp, SIGNUP_POLICY, throttleMessage } from "@/lib/auth/throttle";

// 가입 — 이메일 인증 없이 계정을 만들고 바로 로그인시킨다. 권한이 없는 "대기" 상태이고, 오너·직원이 역할·브랜드를 할당해야 화면에 접근한다.
export async function POST(request: NextRequest) {
  if (!isSignupEnabled()) return NextResponse.json({ error: "지금은 직접 가입을 받지 않아요. 계정이 필요하면 조직 관리자에게 발급을 요청해 주세요." }, { status: 403 });
  const body = await request.json().catch(() => null);
  // 계정 대량 생성 방지 — 한 IP에서 시간당 가입 시도 수를 제한한다.
  const ipKey = `signup:ip:${clientIp(request.headers)}`;
  const gate = await checkAllowed([ipKey]);
  if (gate.blocked) {
    return NextResponse.json({ error: throttleMessage(gate.retryAfterSec) }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });
  }
  await registerFailure(ipKey, SIGNUP_POLICY);
  try {
    const user = await createUser({ loginId: String(body?.loginId ?? ""), name: String(body?.name ?? ""), password: String(body?.password ?? ""), source: "signup" });
    const session = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === "exists" ? 409 : 400 });
    throw error;
  }
}
