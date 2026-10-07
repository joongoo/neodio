import { NextResponse } from "next/server";
import { requireUserManager } from "@/lib/backend/auth/guard";
import { listUsers } from "@/lib/backend/auth/userAdminStore";

// 유저 목록 — 직원은 전체, 오너·admin은 자기 조직 구성원.
export async function GET() {
  const gate = await requireUserManager();
  if ("denied" in gate) return gate.denied;
  return NextResponse.json({ users: await listUsers(gate.principal) });
}
