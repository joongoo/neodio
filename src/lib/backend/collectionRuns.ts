import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PromptRunSeed } from "@/lib/db/types";
import { CollectedRunFile } from "./collectionRunsTypes";

// Reads the actual files scripts/collect-naver-ai.mjs and
// scripts/collect-google-ai.mjs write to disk (.tmp/*-ai/*.json, PromptRunSeed
// shape) — no mock data. This is the real collector output, listed live.
// Server-only (imports node:fs) — import from a page/server component, never
// from a "use client" component; see collectionRunsTypes.ts for the client-safe half.
const RUN_DIRS = [".tmp/naver-ai", ".tmp/google-ai"];

async function readDirRuns(dir: string): Promise<CollectedRunFile[]> {
  const filenames = await readdir(path.join(process.cwd(), dir)).catch(() => []);
  const jsonFiles = filenames.filter((f) => f.endsWith(".json"));

  const files = await Promise.all(
    jsonFiles.map(async (filename) => {
      try {
        const raw = await readFile(path.join(process.cwd(), dir, filename), "utf8");
        const parsed = JSON.parse(raw) as { promptRun?: PromptRunSeed };
        return parsed.promptRun ? { filename, dir, promptRun: parsed.promptRun } : null;
      } catch {
        return null;
      }
    })
  );

  return files.filter((f): f is CollectedRunFile => f !== null);
}

export async function listCollectedRuns(): Promise<CollectedRunFile[]> {
  const perDir = await Promise.all(RUN_DIRS.map(readDirRuns));
  return perDir.flat().sort((a, b) => b.promptRun.runAt.localeCompare(a.promptRun.runAt));
}

export type { CollectedRunFile };
export { isBotBlocked } from "./collectionRunsTypes";
