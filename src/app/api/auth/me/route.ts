import { NextResponse } from "next/server";
import { getCurrentPrincipal, getCurrentUser } from "@/lib/backend/auth/session";
import { isPending } from "@/lib/auth/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const principal = await getCurrentPrincipal();
  return NextResponse.json({ user, memberships: principal?.memberships ?? [], pending: principal ? isPending(principal) : true });
}
