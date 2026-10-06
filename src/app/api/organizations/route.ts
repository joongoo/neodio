import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { orgSlugError } from "@/lib/slug";
import { filterAccessibleOrgs, guardApi, guardOrgTarget } from "@/lib/backend/auth/guard";

// 설정 > 조직 관리 — 조직 목록/추가/이름 변경/삭제. 조직을 고르는 것은
// 헤더 스위처(쿠키)의 몫이고, 여기서는 조직 자체만 다룬다.
const MAX_NAME = 50;

function validateName(value: unknown): string | { error: string } {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "조직 이름을 입력하세요." };
  if (name.length > MAX_NAME) return { error: `조직 이름은 ${MAX_NAME}자 이하여야 합니다.` };
  return name;
}

// URL의 조직 자리 — 영문 소문자·숫자·하이픈, 앱 화면 주소와 겹치면 안 된다(src/lib/slug.ts).
function validateSlug(value: unknown): string | { error: string } {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!slug) return { error: "URL 슬러그를 입력하세요." };
  const error = orgSlugError(slug);
  return error ? { error } : slug;
}

async function conflict(name: string, slug: string | null, exceptId?: string): Promise<string | null> {
  const orgs = (await (await getPromptStore()).listOrganizations()).filter((o) => o.id !== exceptId);
  if (orgs.some((o) => o.name.toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"))) return "같은 이름의 조직이 있습니다.";
  if (slug && orgs.some((o) => o.slug === slug)) return "같은 URL 슬러그를 쓰는 조직이 있습니다.";
  return null;
}

export async function GET() {
  const denied = await guardApi("read");
  if (denied) return denied;
  return NextResponse.json({ organizations: await filterAccessibleOrgs(await (await getPromptStore()).listOrganizations()) });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi("staff");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = validateName(body?.name);
  if (typeof name !== "string") return NextResponse.json(name, { status: 400 });
  const slug = validateSlug(body?.slug);
  if (typeof slug !== "string") return NextResponse.json(slug, { status: 400 });
  // 헤더 스위처가 이름으로, URL이 슬러그로 조직을 고르므로 둘 다 겹치면 안 된다.
  const clash = await conflict(name, slug);
  if (clash) return NextResponse.json({ error: clash }, { status: 409 });
  const organization = await (await getPromptStore()).createOrganization(name, slug);
  return NextResponse.json({ organization }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const denied = await guardOrgTarget(id);
  if (denied) return denied;
  const name = validateName(body?.name);
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  if (typeof name !== "string") return NextResponse.json(name, { status: 400 });
  // 슬러그를 바꾸면 그 조직의 기존 링크(북마크)는 더 이상 열리지 않는다 — 화면에서 경고한다.
  const slug = body?.slug === undefined ? null : validateSlug(body.slug);
  if (slug !== null && typeof slug !== "string") return NextResponse.json(slug, { status: 400 });
  const clash = await conflict(name, slug, id);
  if (clash) return NextResponse.json({ error: clash }, { status: 409 });
  if (!(await (await getPromptStore()).updateOrganization(id, { name, slug: slug ?? undefined }))) {
    return NextResponse.json({ error: "조직을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi("staff");
  if (denied) return denied;
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
