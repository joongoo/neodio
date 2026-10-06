import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/backend/auth/authStore";
import { clearSessionCookie, currentSessionToken } from "@/lib/backend/auth/session";

export async function POST() {
  await deleteSession(await currentSessionToken());
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
