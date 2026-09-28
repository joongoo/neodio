import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";

// 설정 > 조직 관리 — 조직 목록/추가/이름 변경/삭제. 조직을 고르는 것은
// 헤더 스위처(쿠키)의 몫이고, 여기서는 조직 자체만 다룬다.
const MAX_NAME = 50;

function validateName(value: unknown): string | { error: string } {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "조직 이름을 입력하세요." };
  if (name.length > MAX_NAME) return { error: `조직 이름은 ${MAX_NAME}자 이하여야 합니다.` };
  return name;
}

async function nameTaken(name: string, exceptId?: string) {
  const orgs = await (await getPromptStore()).listOrganizations();
  return orgs.some((o) => o.id !== exceptId && o.name.toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"));
}

export async function GET() {
  return NextResponse.json({ organizations: await (await getPromptStore()).listOrganizations() });
}

export async function POST(request: NextRequest) {
  const name = validateName((await request.json().catch(() => null))?.name);
  if (typeof name !== "string") return NextResponse.json(name, { status: 400 });
  // 헤더 스위처가 이름으로 조직을 고르므로 이름은 겹치면 안 된다.
  if (await nameTaken(name)) return NextResponse.json({ error: "같은 이름의 조직이 있습니다." }, { status: 409 });
  const organization = await (await getPromptStore()).createOrganization(name);
  return NextResponse.json({ organization }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const name = validateName(body?.name);
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  if (typeof name !== "string") return NextResponse.json(name, { status: 400 });
  if (await nameTaken(name, id)) return NextResponse.json({ error: "같은 이름의 조직이 있습니다." }, { status: 409 });
  if (!(await (await getPromptStore()).renameOrganization(id, name))) {
    return NextResponse.json({ error: "조직을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  const store = await getPromptStore();
  const orgs = await store.listOrganizations();
  const org = orgs.find((o) => o.id === id);
  if (!org) return NextResponse.json({ error: "조직을 찾을 수 없습니다." }, { status: 404 });
  if (orgs.length === 1) return NextResponse.json({ error: "조직이 하나뿐이라 삭제할 수 없습니다." }, { status: 400 });
  if (!(await store.deleteOrganization(id))) {
    return NextResponse.json({ error: `브랜드 ${org.brandCount}개가 남아 있습니다. 브랜드를 먼저 삭제하세요.` }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
