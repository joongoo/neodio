import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getPromptStore } from "@/lib/backend/database";
import { enqueueGemini } from "@/lib/backend/llm/geminiQueue";
import { dispatchGemini } from "@/lib/backend/llm/geminiDispatch";
import { resolveApiKey } from "@/lib/backend/llm/runner";

export const maxDuration = 180;
export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (!tenant.brandId || typeof body?.requestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.requestId)
    || !Array.isArray(body.keywords) || !body.keywords.length || body.keywords.length > 2000
    || body.keywords.some((q: unknown) => typeof q !== "string" || !q.trim() || q.length > 500)) {
    return NextResponse.json({ error: "수집 요청과 프롬프트를 확인해 주세요." }, { status: 400 });
  }
  try { resolveApiKey("GEMINI_API_KEY"); } catch {
    return NextResponse.json({ error: "Gemini 수집이 설정되지 않았습니다." }, { status: 503 });
  }
  const scope = { organizationId: tenant.orgId, brandId: tenant.brandId, clientRequestId: body.requestId };
  const db = await getPromptStore();
  let result;
  try { result = await enqueueGemini(scope, body.keywords, db); } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "등록에 실패했습니다." }, { status: 409 });
  }
  try { await dispatchGemini(scope); } catch {
    return NextResponse.json({ error: "작업은 저장됐지만 서버 실행 연결에 실패했습니다. 요청 로그에서 대기 작업의 실행을 다시 요청해 주세요.", href: `${tenant.base}/collection-runs/${encodeURIComponent(result.requestId)}` }, { status: 503 });
  }
  return NextResponse.json({ ...result, href: `${tenant.base}/collection-runs/${encodeURIComponent(result.requestId)}` }, { status: 202 });
}
