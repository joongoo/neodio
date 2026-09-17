import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { deleteCategory, listCategories, saveCategory } from "@/lib/backend/categoryStore";

export async function GET() {
  return NextResponse.json({ categories: await listCategories(DEFAULT_ORG_ID) });
}

async function save(request: NextRequest, editing: boolean) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const id = typeof body?.id === "string" ? body.id : undefined;
  if (!name || (editing && !id)) return NextResponse.json({ error: "카테고리 정보가 필요합니다." }, { status: 400 });
  try {
    await saveCategory(DEFAULT_ORG_ID, name, editing ? id : undefined);
    return GET();
  } catch (error) {
    if (error instanceof Error && error.message === "Category already exists") return NextResponse.json({ error: "동일한 카테고리가 있습니다." }, { status: 409 });
    if (error instanceof Error && error.message === "Category not found") return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
    throw error;
  }
}

export const POST = (request: NextRequest) => save(request, false);
export const PATCH = (request: NextRequest) => save(request, true);

export async function DELETE(request: NextRequest) {
  try {
    const found = await deleteCategory(DEFAULT_ORG_ID, request.nextUrl.searchParams.get("id") ?? "");
    if (!found) return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
    return GET();
  } catch (error) {
    if (error instanceof Error && error.message === "Category is in use") return NextResponse.json({ error: "사용 중인 프롬프트를 다른 카테고리로 옮긴 후 삭제해주세요." }, { status: 409 });
    throw error;
  }
}
