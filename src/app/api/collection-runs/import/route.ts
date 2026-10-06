import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import type { PromptRunSeed } from "@/lib/db/types";
import { guardApi } from "@/lib/backend/auth/guard";

const MAX_RUNS_PER_REQUEST = 50;
// 수집 스크립트가 rawMetadata.source에 쓰는 값 → 저장 위치(dir). 로컬 수집 결과 폴더 이름과 같다.
const SOURCE_DIRS: Record<string, string> = {
  "naver-ai-search": ".tmp/naver-ai",
  "naver-overview": ".tmp/naver-overview",
  "google-ai-overview": ".tmp/google-ai",
};

// 선택 수집의 "반영" — 사용자 PC의 수집기가 모은 결과(수집 스크립트가 쓴 JSON의
// promptRun)를 브라우저가 받아 올린다. 지금 보고 있는 조직으로 저장하고, 같은
// 결과를 다시 올려도 같은 실행으로 덮어쓴다(실행 ID 기준). 분석(언급·인용)은
// 화면이 읽을 때 조직의 브랜드 설정으로 계산된다.
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const runs: unknown[] = Array.isArray(body?.runs) ? body.runs : [];
  if (runs.length === 0) return NextResponse.json({ error: "반영할 수집 결과가 없습니다." }, { status: 400 });
  if (runs.length > MAX_RUNS_PER_REQUEST) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_RUNS_PER_REQUEST}건까지 반영할 수 있습니다.` }, { status: 400 });
  }

  const files: { dir: string; filename: string; promptRun: PromptRunSeed }[] = [];
  for (const entry of runs) {
    const { filename, promptRun } = (entry ?? {}) as { filename?: unknown; promptRun?: PromptRunSeed };
    const source = promptRun?.rawMetadata?.source;
    const valid =
      typeof filename === "string" &&
      /^[\w.:-]+\.json$/.test(filename) &&
      typeof promptRun?.id === "string" &&
      typeof promptRun.runAt === "string" &&
      (promptRun.status === "success" || promptRun.status === "failed") &&
      typeof promptRun.rawResponse === "string" &&
      typeof promptRun.rawMetadata?.query === "string" &&
      typeof source === "string" &&
      Object.hasOwn(SOURCE_DIRS, source);
    if (!valid) return NextResponse.json({ error: "수집 결과 형식이 올바르지 않습니다." }, { status: 400 });
    files.push({ dir: SOURCE_DIRS[source as string], filename: filename as string, promptRun: promptRun as PromptRunSeed });
  }

  const orgId = (await getCurrentTenant()).orgId;
  const store = await getPromptStore();
  try {
    await store.transaction(async () => {
      for (const file of files) await store.importRun(orgId, file, null);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = message.includes("another organization");
    return NextResponse.json(
      { error: conflict ? "이미 다른 조직에 반영된 수집 결과가 있습니다." : `반영하지 못했습니다: ${message}` },
      { status: conflict ? 409 : 500 }
    );
  }
  return NextResponse.json({ imported: files.length });
}
