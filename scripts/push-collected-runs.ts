// 로컬에서 수집한 AI검색 결과 파일(.tmp/naver-ai, .tmp/google-ai)을 원격(운영) DB에 반영한다.
// 로컬 대시보드에서 수집한 결과를 운영에 올릴 때 — 선택 수집 화면의 "반영"과 같은 저장
// (importRun: 실행 ID 기준 덮어쓰기)을 한다. 기본은 미리보기, --apply로 실제 반영.
// 전체가 한 트랜잭션이라 실패하면 아무것도 바뀌지 않는다.
//
//   npm run db:push-runs-to-prod -- --since 2026-09-29 [--apply]
//
// 조직: 파일을 만든 수집 작업(로컬 collection_jobs)의 조직을 이름으로 원격 조직과 대조한다.
// 작업이 없는 파일(CLI로 직접 수집)은 기본 조직(neodigm). 원격에 같은 이름의 조직이 없으면 중단.
// 파일 수정 시각이 --since(한국 날짜 00:00) 이후인 것만 대상이다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PromptStore } from "../src/lib/backend/database/store";
import type { PromptRunSeed } from "../src/lib/db/types";

const RUN_DIRS = [".tmp/naver-ai", ".tmp/naver-overview", ".tmp/google-ai"];
const DEFAULT_ORG_ID = "neodigm";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const since = argValue("since");
  const apply = process.argv.includes("--apply");
  const sourceUrl = process.env.SOURCE_POSTGRES_URL;
  const targetUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since yyyy-mm-dd(한국 날짜)가 필요합니다.");
  if (!sourceUrl || !targetUrl) throw new Error("SOURCE_POSTGRES_URL(로컬)과 POSTGRES_URL(원격)이 필요합니다.");
  if (sourceUrl === targetUrl) throw new Error("원본과 대상이 같은 DB입니다.");
  const sinceMs = Date.parse(`${since}T00:00:00+09:00`);

  const files: { dir: string; filename: string; promptRun: PromptRunSeed }[] = [];
  for (const dir of RUN_DIRS) {
    let names: string[] = [];
    try {
      names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
    } catch {
      continue;
    }
    for (const filename of names) {
      const file = path.join(dir, filename);
      if (statSync(file).mtimeMs < sinceMs) continue;
      const promptRun = (JSON.parse(readFileSync(file, "utf8")) as { promptRun?: PromptRunSeed }).promptRun;
      if (promptRun) files.push({ dir, filename, promptRun });
    }
  }
  if (files.length === 0) {
    console.log(`${since} 이후 수집 파일이 없습니다.`);
    return;
  }

  const source = new Pool({ connectionString: sourceUrl });
  const targetPool = new Pool({ connectionString: targetUrl });
  try {
    // 수집 작업 → 로컬 조직 이름 → 원격 조직 id
    const jobIds = [...new Set(files.map((f) => f.promptRun.rawMetadata.collectionJobId).filter((id): id is string => !!id))];
    const localJobs = (
      await source.query<{ id: string; name: string }>(
        "SELECT j.id, o.name FROM collection_jobs j JOIN organizations o ON o.id=j.organization_id WHERE j.id = ANY($1)",
        [jobIds]
      )
    ).rows;
    const orgNameByJob = new Map(localJobs.map((r) => [r.id, r.name]));
    const remoteOrgs = (await targetPool.query<{ id: string; name: string }>("SELECT id,name FROM organizations")).rows;
    const remoteOrgByName = new Map(remoteOrgs.map((o) => [o.name, o.id]));

    const plan = files.map((file) => {
      const jobId = file.promptRun.rawMetadata.collectionJobId;
      const orgName = jobId ? orgNameByJob.get(jobId) : undefined;
      const orgId = orgName ? remoteOrgByName.get(orgName) : DEFAULT_ORG_ID;
      if (!orgId) throw new Error(`원격에 "${orgName}" 조직이 없습니다 — 먼저 조직을 옮기세요(db:sync-org-to-prod).`);
      return { ...file, orgId };
    });

    const existing = new Set(
      (await targetPool.query<{ id: string }>("SELECT id FROM prompt_runs WHERE id = ANY($1)", [plan.map((p) => p.promptRun.id)])).rows.map((r) => r.id)
    );
    const byOrg = new Map<string, number>();
    for (const p of plan) byOrg.set(p.orgId, (byOrg.get(p.orgId) ?? 0) + 1);
    const statuses = plan.reduce<Record<string, number>>((acc, p) => ((acc[p.promptRun.status] = (acc[p.promptRun.status] ?? 0) + 1), acc), {});
    console.log(`대상 ${plan.length}건 (${Object.entries(statuses).map(([s, n]) => `${s} ${n}`).join(", ")}) — 새로 ${plan.length - existing.size}건, 이미 있음 ${existing.size}건(덮어씀)`);
    for (const [orgId, n] of byOrg) console.log(`  조직 ${remoteOrgs.find((o) => o.id === orgId)?.name ?? orgId}: ${n}건`);
    console.log(`  질문 ${new Set(plan.map((p) => p.promptRun.rawMetadata.query)).size}개`);

    if (!apply) {
      console.log("미리보기입니다. 반영하려면 --apply를 붙이세요.");
      return;
    }
    const target = new PromptStore(targetPool);
    await target.init();
    await target.transaction(async () => {
      for (const p of plan) await target.importRun(p.orgId, { dir: p.dir, filename: p.filename, promptRun: p.promptRun }, null);
    });
    console.log(`반영 완료: ${plan.length}건`);
  } finally {
    await source.end();
    await targetPool.end().catch(() => null);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
