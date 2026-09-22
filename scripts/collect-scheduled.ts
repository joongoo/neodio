// Cron entry point for unattended collection. A single machine/IP is doing
// all the requesting here (no proxy rotation — see budget decision), so the
// only lever against Google's captcha wall is looking less like a bot:
// keywords run one at a time, in shuffled order, with a randomized gap
// between them instead of back-to-back requests. Run this from system cron
// on a VPS with real Chrome installed, e.g.:
//   0 9 * * * cd /path/to/neodio && npm run collect:scheduled >> .tmp/collect-scheduled.log 2>&1
import { getPromptStore } from "../src/lib/backend/database";
import { getJob, startCollectionJob } from "../src/lib/backend/collectionJobRunner";

const ORG_ID = "neodigm";

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randomDelayMs(minMs: number, maxMs: number) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(jobId: string): Promise<void> {
  while (true) {
    const job = await getJob(jobId);
    if (!job || job.stage === "done" || job.stage === "error") return;
    await sleep(2_000);
  }
}

async function main() {
  const engines = argValue("engines", "naver,google").split(",").filter((e): e is "naver" | "google" => e === "naver" || e === "google");
  const minDelayMs = Number(argValue("min-delay-ms", String(3 * 60_000)));
  const maxDelayMs = Number(argValue("max-delay-ms", String(8 * 60_000)));
  const limit = Number(argValue("limit", "0")) || undefined;

  const store = await getPromptStore();
  const keywords = shuffle(store.library(ORG_ID).map((row) => row.prompt)).slice(0, limit);

  console.log(`[collect-scheduled] ${keywords.length}개 키워드, 엔진: ${engines.join(",")}`);

  for (const [index, keyword] of keywords.entries()) {
    console.log(`[collect-scheduled] (${index + 1}/${keywords.length}) "${keyword}" 수집 시작`);
    try {
      const job = startCollectionJob(keyword, engines);
      await waitForJob(job.id);
      const finished = await getJob(job.id);
      console.log(`[collect-scheduled] "${keyword}" ${finished?.stage === "done" ? "완료" : `실패 (${finished?.error ?? "unknown"})`}`);
    } catch (error) {
      console.error(`[collect-scheduled] "${keyword}" 수집 중 예외:`, error);
    }

    if (index < keywords.length - 1) {
      const delay = randomDelayMs(minDelayMs, maxDelayMs);
      console.log(`[collect-scheduled] 다음 키워드까지 ${Math.round(delay / 1000)}초 대기`);
      await sleep(delay);
    }
  }

  store.sql.close();
  console.log("[collect-scheduled] 전체 완료");
}

main().catch((error) => {
  console.error("[collect-scheduled] 치명적 오류:", error);
  process.exit(1);
});
