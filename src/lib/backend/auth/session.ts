import { cache } from "react";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getSessionUser, principalFor, SESSION_COOKIE, type AuthUser } from "./authStore";
import type { Principal } from "@/lib/auth/permissions";

// 요청의 로그인 사용자 — 서버 전용. AUTH_ENABLED=true일 때만 로그인을 강제한다(기본은 꺼짐: 지금처럼 공유 비밀번호만).

export const isAuthEnabled = () => process.env.AUTH_ENABLED === "true";
/** 자가 가입 허용 여부 — 기본은 열려 있고, SIGNUP_ENABLED=false면 닫고 계정 발급(조직 관리·유저 관리)으로만 만든다. */
export const isSignupEnabled = () => process.env.SIGNUP_ENABLED !== "false";

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  try {
    return await getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return null; // 요청 밖(테스트·스크립트)
  }
});

export const getCurrentPrincipal = cache(async (): Promise<Principal | null> => {
  const user = await getCurrentUser();
  return user ? principalFor(user) : null;
});

export async function currentSessionToken(): Promise<string | undefined> {
  try {
    return (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
