import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { DEFAULT_TRACKING_BRAND, getPromptStore, syncCollectedFiles } from "@/lib/backend/database";
import { normalize } from "@/lib/backend/database/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  const params = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  const status = params.get("status") ?? "all";
  if (!["all", "untracked", "active", "paused", "archived"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const query = normalize(params.get("q") ?? "");
  const joins = `FROM prompts p LEFT JOIN topics t ON t.id=p.topic_id
    LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
    LEFT JOIN prompt_tracking tr ON tr.prompt_id=p.id AND tr.brand_id=?
    WHERE p.organization_id=? AND instr(p.normalized_text,?)>0
    AND (?='all' OR (?='untracked' AND tr.id IS NULL) OR tr.status=?)`;
  const args = [DEFAULT_TRACKING_BRAND, DEFAULT_ORG_ID, query, status, status, status];
  const total = store.sql.prepare(`SELECT count(*) AS count ${joins}`).get(...args)!.count;
  const rows = store.sql.prepare(`SELECT p.id,p.text,p.search_intent,p.created_at,p.updated_at,
    t.id AS topic_id,t.name AS topic,c.id AS category_id,c.name AS category,
    tr.id AS tracking_id,coalesce(tr.status,'untracked') AS tracking_status,tr.added_at,tr.added_by
    ${joins} ORDER BY p.created_at DESC,p.id LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const prompts = rows.map(row => ({ ...row, sources: store.sql.prepare(`SELECT id,source_type,source_key,generation_purpose,
    generation_reasoning,metadata_json,created_at FROM prompt_sources WHERE prompt_id=? ORDER BY created_at`).all(row.id)
    .map(({ metadata_json, ...source }) => ({ ...source, metadata: JSON.parse(metadata_json as string) })) }));
  return NextResponse.json({ prompts, total, limit, offset });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (typeof body?.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "프롬프트가 필요합니다." }, { status: 400 });
  const optional = (key: string) => typeof body[key] === "string" ? body[key] : undefined;
  const store = await getPromptStore();
  const promptId = store.upsertPrompt(DEFAULT_ORG_ID, { text: body.text, category: optional("category"), topic: optional("topic"),
    searchIntent: optional("searchIntent"), sourceType: optional("sourceType") ?? "manual", sourceKey: optional("sourceKey"),
    generationPurpose: optional("generationPurpose"), generationReasoning: optional("generationReasoning") });
  return NextResponse.json({ prompt: store.getPrompt(DEFAULT_ORG_ID, promptId) }, { status: 201 });
}
