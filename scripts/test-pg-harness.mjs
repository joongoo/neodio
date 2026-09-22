// `npm run test:db` needs a real Postgres server (see docs/database.md — the
// store's tests run real SQL against real Postgres, not a SQLite file or an
// in-memory mock). This harness boots a disposable local Postgres cluster in
// a temp dir, points POSTGRES_URL/POSTGRES_URL_NON_POOLING at it, runs the
// node:test files, then tears the cluster down. It never touches any
// existing Postgres install — it's a fresh initdb in os.tmpdir().
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function resolvePgBinDir() {
  const candidates = [
    process.env.PG_BIN_DIR,
    spawnSync("which", ["initdb"]).stdout?.toString().trim()?.replace(/\/initdb$/, ""),
    "/opt/homebrew/opt/postgresql@18/bin",
    "/opt/homebrew/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/local/opt/postgresql/bin",
  ].filter(Boolean);
  for (const dir of candidates) {
    if (spawnSync(path.join(dir, "pg_ctl"), ["--version"]).status === 0) return dir;
  }
  throw new Error("No local Postgres (initdb/pg_ctl) found — set PG_BIN_DIR or install postgresql.");
}

const bin = resolvePgBinDir();
const dir = mkdtempSync(path.join(os.tmpdir(), "neodio-pg-test-"));
const dataDir = path.join(dir, "data");
const port = 55432 + Math.floor(Math.random() * 500);
const env = { ...process.env, LC_ALL: "C", LANG: "C", OBJC_DISABLE_INITIALIZE_FORK_SAFETY: "YES" };

function run(cmd, args) {
  const result = spawnSync(cmd, args, { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

run(path.join(bin, "initdb"), ["-D", dataDir, "-U", "neodio_test", "--auth=trust", "-E", "UTF8"]);
run(path.join(bin, "pg_ctl"), ["-D", dataDir, "-o", `-p ${port} -k ${dir}`, "-l", path.join(dir, "log"), "-w", "start"]);

const connectionString = `postgres://neodio_test@127.0.0.1:${port}/postgres?sslmode=disable`;
const childEnv = { ...process.env, POSTGRES_URL: connectionString, POSTGRES_URL_NON_POOLING: connectionString };

function cleanup() {
  spawnSync(path.join(bin, "pg_ctl"), ["-D", dataDir, "stop", "-m", "immediate"], { env });
  rmSync(dir, { recursive: true, force: true });
}

const child = spawn("npx", ["tsx", "--test", "src/lib/backend/database/store.test.ts", "src/lib/backend/database/api.test.ts"],
  { env: childEnv, stdio: "inherit" });
child.on("exit", (code) => { cleanup(); process.exit(code ?? 1); });
child.on("error", (error) => { console.error(error); cleanup(); process.exit(1); });
