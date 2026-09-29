// LLM API 정기 수집 — 조직의 추적 프롬프트를 지정한 LLM에 질문하고 답변·출처를 prompt_runs에 저장한다.
// Chrome·사용자 PC가 필요 없다(공식 API). 새 LLM은 src/lib/backend/llm/providers/에 어댑터를 추가한다.
//
//   npm run collect:llm -- --provider gemini                 # 모든 조직의 추적 프롬프트 전체
//   npm run collect:llm -- --provider gemini --query "CRM 추천" --org neodigm
//   npm run collect:llm -- --provider gemini --limit 3 --no-web-search
//
// 옵션: --provider a,b   --org <orgId>   --query "<단일 질문>"   --limit N   --force(오늘 수집분도 다시)
//       --model <이름>   --no-web-search   --locale ko-KR   --min-delay-ms 1000 --max-delay-ms 3000
// API 키: GEMINI_API_KEY 등 환경변수 또는 키체인(scripts/secret.sh set GEMINI_API_KEY)
import { getPromptStore } from "../src/lib/backend/database";
import { LLM_PROVIDERS, getLlmProvider } from "../src/lib/backend/llm/registry";
import { resolveApiKey, runLlmQuery } from "../src/lib/backend/llm/runner";

function argValue(name: string, fallback: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`);

async function main() {
  const providerIds = argValue("provider", "").split(",").filter(Boolean);
  if (providerIds.length === 0) throw new Error(`--provider가 필요합니다 (${Object.keys(LLM_PROVIDERS).join(" | ")})`);
  const providers = providerIds.map(getLlmProvider);
  const keys = new Map(providers.map((p) => [p.id, resolveApiKey(p.apiKeyEnv)]));

  const orgFilter = argValue("org", "");
  const singleQuery = argValue("query", "");
  const limit = Number(argValue("limit", "0")) || undefined;
  const minDelay = Number(argValue("min-delay-ms", "1000"));
  const maxDelay = Math.max(minDelay, Number(argValue("max-delay-ms", "3000")));

  const store = await getPromptStore();
  const orgs = (await store.listOrganizations()).filter((org) => !orgFilter || org.id === orgFilter);
  if (orgs.length === 0) throw new Error(`조직을 찾지 못했습니다: ${orgFilter}`);

  const today = new Date().toISOString().slice(0, 10);
  const tasks: { orgId: string; provider: (typeof providers)[number]; query: string }[] = [];
  for (const org of orgs) {
    const queries = singleQuery ? [singleQuery] : [...new Set((await store.library(org.id)).map((row) => row.prompt))];
    const done = flag("force")
      ? new Set<string>()
      : new Set((await store.runs(org.id)).filter((r) => r.promptRun.runAt.startsWith(today) && r.promptRun.status === "success")
          .map((r) => `${r.promptRun.llmModelId}\n${r.promptRun.rawMetadata.query}`));
    for (const provider of providers) {
      for (const query of queries) if (!done.has(`${provider.llmModelId}\n${query}`)) tasks.push({ orgId: org.id, provider, query });
    }
  }
  const planned = tasks.slice(0, limit);
  log(`${planned.length}건 수집 (${providers.map((p) => p.id).join(",")}, 조직 ${orgs.length}곳)`);

  let ok = 0;
  for (const [index, task] of planned.entries()) {
    const result = await runLlmQuery({
      store,
      orgId: task.orgId,
      provider: task.provider,
      query: task.query,
      apiKey: keys.get(task.provider.id)!,
      model: argValue("model", "") || undefined,
      webSearch: !flag("no-web-search"),
      locale: argValue("locale", "ko-KR"),
    });
    if (result.status === "success") ok++;
    log(`(${index + 1}/${planned.length}) [${task.provider.id}] "${task.query.slice(0, 40)}" → ${result.status}${result.status === "success" ? `, 출처 ${result.citations}건` : `: ${result.errorMessage}`}`);
    if (index < planned.length - 1) await sleep(minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1)));
  }
  await store.close();
  log(`완료: 성공 ${ok} / 실패 ${planned.length - ok}`);
  if (planned.length > 0 && ok === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
