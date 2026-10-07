import { NextResponse } from "next/server";
import { audit, deleteSession } from "@/lib/backend/auth/authStore";
import { clearSessionCookie, currentSessionToken, getCurrentUser } from "@/lib/backend/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (user) await audit(null, user.id, "auth.logout", user.id);
  await deleteSession(await currentSessionToken());
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
