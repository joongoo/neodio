// 네오디오 수집기 — 수집 PC에 설치하는 작은 로컬 프로그램.
//
// 운영(Vercel)에는 실제 Chrome이 없어서 AI검색 수집은 사용자 PC에서 돈다. 이
// 수집기는 127.0.0.1에서만 요청을 받고, 웹 화면(브라우저)이 다리 역할을 한다:
//   웹 "선택 수집" → 수집기 확인(설치·버전) → 프롬프트로 수집 명령 → 수집기가
//   Chrome으로 수집해 이 PC에 결과 저장 → 웹에서 결과 확인 후 "반영" →
//   브라우저가 결과를 받아 서버에 저장.
// 수집기는 서버·DB에 직접 붙지 않고 비밀 정보도 갖지 않는다.
//
// 명령: run(수집기 실행) · install(이 PC에 설치 + 로그인 시 자동 시작) · uninstall · status
// 개발: npm run collector -- run  (scripts/의 수집 스크립트를 그대로 쓴다)
// 배포: node collector/build.mjs → dist/collector/*.zip (docs/collector.md)
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  COLLECTOR_AGENT_PORT,
  COLLECTOR_VERSION,
  type CollectorAgentStatus,
  type CollectorAioResult,
  type CollectorAioSpec,
  type CollectorCrawlResult,
  type CollectorCrawlSpec,
  type CollectorEngine,
  type CollectorJob,
  type CollectorRunFile,
} from "../src/lib/collectorAgent";
import { parseAioSpec } from "../src/lib/collectorAioSpec";
import { parseCrawlSpec } from "../src/lib/collectorCrawlSpec";
import { resolveChromePath } from "../scripts/lib/incognito-chrome.mjs";

// 빌드할 때(esbuild define) 운영 웹 주소가 들어간다 — 이 주소의 화면만 수집기를 부를 수 있다.
declare const __COLLECTOR_ORIGINS__: string[] | undefined;
const BUILT_IN_ORIGINS: string[] = typeof __COLLECTOR_ORIGINS__ !== "undefined" ? __COLLECTOR_ORIGINS__ : [];
const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 배포본이면 app/ 옆에 번들된 수집 스크립트가 있다. 개발 중엔 저장소의 scripts/. */
const BUNDLED = existsSync(path.join(HERE, "collect-naver-ai.mjs"));
const SCRIPT_DIR = BUNDLED ? HERE : path.resolve(HERE, "../scripts");
const SCRIPTS: Record<CollectorEngine, string> = {
  naver: path.join(SCRIPT_DIR, "collect-naver-ai.mjs"),
  "naver-overview": path.join(SCRIPT_DIR, "collect-naver-ai.mjs"),
  google: path.join(SCRIPT_DIR, "collect-google-ai.mjs"),
};

const ENGINE_NAME: Record<CollectorEngine, string> = { naver: "네이버 AI검색", "naver-overview": "네이버 AI 브리핑", google: "구글 AI 모드" };
const ENGINE_SHORT: Record<CollectorEngine, string> = { naver: "네이버AI", "naver-overview": "네이버AIO", google: "구글AI" };

const CRAWL_SCRIPT = path.join(SCRIPT_DIR, "crawl-sitemap.mjs");
const AIO_SCRIPT = path.join(SCRIPT_DIR, "collect-google-aio.mjs");

// 시험용 — 설치된 수집기와 겹치지 않게 포트와 작업 폴더를 바꿔 개발용 수집기를 따로 띄울 수 있다.
const AGENT_PORT = Number(process.env.NEODIO_COLLECTOR_PORT) || COLLECTOR_AGENT_PORT;

const HOME_DIR = process.env.NEODIO_COLLECTOR_HOME
  ? path.resolve(process.env.NEODIO_COLLECTOR_HOME)
  : process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "NeodioCollector")
    : path.join(os.homedir(), ".neodio-collector");
const JOBS_DIR = path.join(HOME_DIR, "jobs");
const RESULTS_DIR = path.join(HOME_DIR, "results");
const WORK_DIR = path.join(HOME_DIR, "work");
const LOG_DIR = path.join(HOME_DIR, "logs");
const RUNTIME_DIR = path.join(HOME_DIR, "runtime");
const CONFIG_FILE = path.join(HOME_DIR, "config.json");

const MAC_AGENT_LABEL = "com.neodio.collector";
const MAX_LOG_LINES = 300;
const MAX_KEYWORDS = 100;
const KEPT_JOBS = 30;

// ---------- 공통 ----------

function platformId(): string {
  if (process.platform === "darwin") return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (process.platform === "win32") return `win-${process.arch}`;
  return `${process.platform}-${process.arch}`;
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, "agent.log");
    // 5MB가 넘으면 한 번 돌려 쓴다.
    if (existsSync(file) && statSync(file).size > 5 * 1024 * 1024) renameSync(file, `${file}.1`);
    appendFileSync(file, `${line}\n`);
  } catch {
    // 로그 파일을 못 써도 수집은 계속한다.
  }
}

interface Config {
  allowedOrigins: string[];
}

function readConfig(): Config {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<Config>;
    return { allowedOrigins: Array.isArray(parsed.allowedOrigins) ? parsed.allowedOrigins : [] };
  } catch {
    return { allowedOrigins: [] };
  }
}

function allowedOrigins(): Set<string> {
  return new Set([...BUILT_IN_ORIGINS, ...DEV_ORIGINS, ...readConfig().allowedOrigins].map((o) => o.replace(/\/+$/, "")));
}

function argValues(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, i) => {
    if (arg === `--${name}` && process.argv[i + 1]) values.push(process.argv[i + 1]);
    else if (arg.startsWith(`--${name}=`)) values.push(arg.slice(name.length + 3));
  });
  return values;
}

// ---------- 작업 ----------

const jobs = new Map<string, CollectorJob>();
const queue: string[] = [];
let running: { jobId: string; child: ChildProcess | null; cancelled: boolean } | null = null;

function jobFile(id: string) {
  return path.join(JOBS_DIR, `${id}.json`);
}

function saveJob(job: CollectorJob) {
  mkdirSync(JOBS_DIR, { recursive: true });
  writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2));
}

function appendJobLog(job: CollectorJob, text: string) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) job.log.push(trimmed.slice(0, 500));
  }
  if (job.log.length > MAX_LOG_LINES) job.log = job.log.slice(-MAX_LOG_LINES);
}

/** 시작할 때 지난 작업을 불러온다. 수집 도중 꺼졌던 작업은 중단으로 정리하고, 오래된 작업은 지운다. */
function loadJobs() {
  mkdirSync(JOBS_DIR, { recursive: true });
  const loaded: CollectorJob[] = [];
  for (const name of readdirSync(JOBS_DIR).filter((n) => n.endsWith(".json"))) {
    try {
      loaded.push(JSON.parse(readFileSync(path.join(JOBS_DIR, name), "utf8")) as CollectorJob);
    } catch {
      // 깨진 파일은 무시
    }
  }
  loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const [index, job] of loaded.entries()) {
    if (index >= KEPT_JOBS && job.appliedAt) {
      rmSync(jobFile(job.id), { force: true });
      rmSync(path.join(RESULTS_DIR, job.id), { recursive: true, force: true });
      continue;
    }
    if (job.status === "running" || job.status === "queued") {
      job.status = "cancelled";
      job.finishedAt = job.finishedAt ?? new Date().toISOString();
      for (const item of job.items) if (item.status === "pending" || item.status === "running") item.status = "cancelled";
      appendJobLog(job, "수집기가 다시 시작되어 이 작업은 중단됐습니다.");
      saveJob(job);
    }
    jobs.set(job.id, job);
  }
}

function createJob(keywords: string[], engines: CollectorEngine[], label: string): CollectorJob {
  const job: CollectorJob = {
    id: `cjob-${Date.now()}-${randomUUID().slice(0, 8)}`,
    label,
    engines,
    status: "queued",
    items: keywords.map((keyword) => ({ keyword, status: "pending", engine: null, results: 0, error: null })),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    appliedAt: null,
    log: [],
  };
  jobs.set(job.id, job);
  saveJob(job);
  queue.push(job.id);
  void processQueue();
  return job;
}

function createCrawlJob(spec: CollectorCrawlSpec, label: string): CollectorJob {
  const target = spec.sitemapUrl ?? `${spec.urls.length}개 URL 재크롤`;
  const job: CollectorJob = {
    id: `cjob-${Date.now()}-${randomUUID().slice(0, 8)}`,
    kind: "sitemap-crawl",
    crawl: spec,
    label,
    engines: [],
    status: "queued",
    items: [{ keyword: target, status: "pending", engine: null, results: 0, error: null }],
    createdAt: new Date().toISOString(),
    finishedAt: null,
    appliedAt: null,
    log: [],
  };
  jobs.set(job.id, job);
  saveJob(job);
  queue.push(job.id);
  void processQueue();
  return job;
}

function createAioJob(spec: CollectorAioSpec, label: string): CollectorJob {
  const job: CollectorJob = {
    id: `cjob-${Date.now()}-${randomUUID().slice(0, 8)}`,
    kind: "aio-collect",
    aio: spec,
    aioState: { waitUntil: null, captcha: false },
    label,
    engines: [],
    status: "queued",
    items: spec.tasks.map((task) => ({ keyword: `${task.keyword} · ${task.device}`, status: "pending", engine: null, results: 0, error: null })),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    appliedAt: null,
    log: [],
  };
  jobs.set(job.id, job);
  saveJob(job);
  queue.push(job.id);
  void processQueue();
  return job;
}

function jsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
}

function killChild(child: ChildProcess) {
  if (!child.pid) return;
  // 수집 스크립트가 띄운 Chrome까지 같이 내려가야 한다.
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function runScript(job: CollectorJob, engine: CollectorEngine, keyword: string, outDir: string, extraArgs: string[] = []): Promise<number> {
  const args = [SCRIPTS[engine], "--query", keyword, "--out", outDir, ...extraArgs];
  // 네이버도 설치된 Chrome으로 — 배포본에 Playwright 브라우저를 따로 넣지 않는다.
  if (engine === "naver" || engine === "naver-overview") args.push("--browser-channel", "chrome");
  if (engine === "naver-overview") args.push("--mode", "overview");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: WORK_DIR,
      env: { ...process.env, NEODIO_COLLECTION_JOB_ID: job.id },
      windowsHide: true,
    });
    if (running) running.child = child;
    child.stdout?.on("data", (chunk) => appendJobLog(job, chunk.toString()));
    child.stderr?.on("data", (chunk) => appendJobLog(job, chunk.toString()));
    child.on("error", (error) => {
      appendJobLog(job, `실행 실패: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => {
      if (running) running.child = null;
      resolve(code ?? 1);
    });
  });
}

/** 크롤 스크립트 실행 — 설치된 Chrome으로 페이지를 렌더링해 콘텐츠 가시성·FAQ·목차 등을 잰다. */
function runCrawlScript(job: CollectorJob, spec: CollectorCrawlSpec, outDir: string): Promise<number> {
  const args = [CRAWL_SCRIPT, "--domain", spec.domain, "--limit", String(spec.limit), "--out", outDir, "--browser-channel", "chrome"];
  if (spec.urls.length > 0) args.push("--urls", spec.urls.join(","));
  else if (spec.sitemapUrl) args.push("--sitemap", spec.sitemapUrl);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: WORK_DIR, env: { ...process.env }, windowsHide: true });
    if (running) running.child = child;
    child.stdout?.on("data", (chunk) => appendJobLog(job, chunk.toString()));
    child.stderr?.on("data", (chunk) => appendJobLog(job, chunk.toString()));
    child.on("error", (error) => {
      appendJobLog(job, `실행 실패: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => {
      if (running) running.child = null;
      resolve(code ?? 1);
    });
  });
}

async function runCrawlJob(job: CollectorJob, spec: CollectorCrawlSpec) {
  const item = job.items[0];
  item.status = "running";
  saveJob(job);
  log(`▶ 사이트맵 크롤 시작 ${job.id} — ${spec.sitemapUrl ?? `${spec.urls.length}개 URL`}`);
  mkdirSync(WORK_DIR, { recursive: true });
  const outDir = path.join(RESULTS_DIR, job.id, "sitemap-crawl");
  mkdirSync(outDir, { recursive: true });
  const code = await runCrawlScript(job, spec, outDir);
  const results = jobCrawlResults(job);
  item.results = results.reduce((sum, crawl) => sum + crawl.urls.length, 0);
  if (running?.cancelled) item.status = "cancelled";
  else if (code !== 0 || results.length === 0) {
    item.status = "error";
    item.error = "크롤에 실패했습니다. Chrome이 설치돼 있고 사이트에 접속되는지 확인하세요.";
  } else item.status = "done";
  const cancelled = !!running?.cancelled;
  job.status = cancelled ? "cancelled" : "done";
  job.finishedAt = new Date().toISOString();
  saveJob(job);
  log(`■ 사이트맵 크롤 ${cancelled ? "중단" : "완료"} ${job.id}`);
}

/** 검색 사이에 쉰다 — 중단 요청을 1초 안에 알아채도록 잘게 나눠 잔다. */
async function interruptibleSleep(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until && !running?.cancelled) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, until - Date.now())));
}

/** Google AI Overview 검색 한 건 — 설치된 Chrome을 시크릿으로 띄워 검색하고 결과 JSON을 outDir에 남긴다. */
function runAioScript(job: CollectorJob, spec: CollectorAioSpec, task: CollectorAioSpec["tasks"][number], outDir: string): Promise<number> {
  const args = [AIO_SCRIPT, "--query", task.keyword, "--device", task.device, "--country", spec.country, "--language", spec.language, "--out", outDir];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: WORK_DIR, env: { ...process.env }, windowsHide: true });
    if (running) running.child = child;
    child.stdout?.on("data", (chunk) => appendJobLog(job, chunk.toString()));
    child.stderr?.on("data", (chunk) => appendJobLog(job, chunk.toString()));
    child.on("error", (error) => {
      appendJobLog(job, `실행 실패: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => {
      if (running) running.child = null;
      resolve(code ?? 1);
    });
  });
}

function aioTaskDir(job: CollectorJob, index: number) {
  return path.join(RESULTS_DIR, job.id, "aio", String(index));
}

/** 이 작업이 끝낸 검색들의 원본 결과 — 수집 스크립트가 쓴 JSON. 화면 캡처·HTML은 이 PC에 남는다. */
function jobAioResults(job: CollectorJob): CollectorAioResult[] {
  const results: CollectorAioResult[] = [];
  for (const [index] of (job.aio?.tasks ?? []).entries()) {
    const dir = aioTaskDir(job, index);
    const file = jsonFiles(dir).sort().at(-1);
    if (!file) continue;
    try {
      results.push({ index, result: JSON.parse(readFileSync(path.join(dir, file), "utf8")) });
    } catch {
      // 쓰다 만 파일은 건너뛴다
    }
  }
  return results;
}

async function runAioScriptWithRetry(job: CollectorJob, spec: CollectorAioSpec, task: CollectorAioSpec["tasks"][number], outDir: string): Promise<number> {
  let code = await runAioScript(job, spec, task, outDir);
  for (let attempt = 2; attempt <= MAX_ATTEMPTS && code === BROWSER_CLOSED_EXIT_CODE && !running?.cancelled; attempt++) {
    appendJobLog(job, `Chrome 창이 중간에 닫혀 새 창으로 다시 시도합니다 (${attempt}/${MAX_ATTEMPTS}).`);
    await interruptibleSleep(5_000);
    code = await runAioScript(job, spec, task, outDir);
  }
  return code;
}

async function runAioJob(job: CollectorJob, spec: CollectorAioSpec) {
  const state = (job.aioState ??= { waitUntil: null, captcha: false });
  log(`▶ AI Overview 수집 시작 ${job.id} — ${spec.tasks.length}건`);
  mkdirSync(WORK_DIR, { recursive: true });

  for (const [index, task] of spec.tasks.entries()) {
    if (running?.cancelled) break;
    const item = job.items[index];
    if (index > 0) {
      const delay = spec.minDelayMs + Math.floor(Math.random() * (spec.maxDelayMs - spec.minDelayMs + 1));
      state.waitUntil = Date.now() + delay;
      saveJob(job);
      await interruptibleSleep(delay);
      state.waitUntil = null;
      if (running?.cancelled) break;
    }
    if (googleCountToday() >= GOOGLE_DAILY_CAP) {
      item.status = "error";
      item.error = `하루 수집 상한(${GOOGLE_DAILY_CAP}건)에 도달했습니다.`;
      saveJob(job);
      continue;
    }
    item.status = "running";
    saveJob(job);
    appendJobLog(job, `"${task.keyword}" (${task.device}) 검색`);
    const outDir = aioTaskDir(job, index);
    mkdirSync(outDir, { recursive: true });
    const code = await runAioScriptWithRetry(job, spec, task, outDir);
    addGoogleCount(1);
    const written = jsonFiles(outDir).length > 0;
    if (running?.cancelled) item.status = "cancelled";
    else if (!written) {
      item.status = "error";
      item.error = code === 0 ? "결과가 남지 않았습니다." : "검색에 실패했습니다.";
    } else {
      item.status = "done";
      item.results = 1;
      // Google이 캡차를 띄우면 그 자리에서 멈춘다 — 남은 검색은 다음 수집 때 이어서 한다.
      const result = jobAioResults(job).find((r) => r.index === index)?.result as { errorKind?: string } | undefined;
      if (result?.errorKind === "captcha") {
        state.captcha = true;
        saveJob(job);
        break;
      }
    }
    saveJob(job);
  }

  // 앞에서 실패한 검색은 나머지를 다 끝낸 뒤 한 번 더 시도한다.
  for (const [index, task] of spec.tasks.entries()) {
    const item = job.items[index];
    if (running?.cancelled || state.captcha || item.status !== "error" || googleCountToday() >= GOOGLE_DAILY_CAP) continue;
    const delay = spec.minDelayMs + Math.floor(Math.random() * (spec.maxDelayMs - spec.minDelayMs + 1));
    state.waitUntil = Date.now() + delay;
    saveJob(job);
    await interruptibleSleep(delay);
    state.waitUntil = null;
    if (running?.cancelled) break;
    item.status = "running";
    item.error = null;
    saveJob(job);
    appendJobLog(job, `"${task.keyword}" (${task.device}) 실패 건 다시 시도`);
    const outDir = aioTaskDir(job, index);
    mkdirSync(outDir, { recursive: true });
    const code = await runAioScriptWithRetry(job, spec, task, outDir);
    if (running?.cancelled) item.status = "cancelled";
    else if (jsonFiles(outDir).length === 0) {
      item.status = "error";
      item.error = code === 0 ? "결과가 남지 않았습니다." : "검색에 실패했습니다.";
    } else {
      item.status = "done";
      item.results = 1;
      const result = jobAioResults(job).find((r) => r.index === index)?.result as { errorKind?: string } | undefined;
      if (result?.errorKind === "captcha") state.captcha = true;
    }
    saveJob(job);
  }

  const cancelled = !!running?.cancelled;
  for (const item of job.items) if (item.status === "pending") item.status = "cancelled";
  state.waitUntil = null;
  job.status = cancelled ? "cancelled" : "done";
  job.finishedAt = new Date().toISOString();
  saveJob(job);
  log(`■ AI Overview 수집 ${cancelled ? "중단" : state.captcha ? "멈춤(캡차)" : "완료"} ${job.id}`);
}

// 검색 사이를 사람처럼 띄운다 — 같은 IP에서 연달아 보내면 캡차가 먼저 뜬다.
const ENGINE_DELAY_MS: Record<string, [number, number]> = { google: [20_000, 45_000], naver: [5_000, 12_000], "naver-overview": [5_000, 12_000] };

// 구글 검색은 하루 상한까지만 — 넘기면 IP가 의심받는다. NEODIO_GOOGLE_DAILY_CAP으로 조정.
const GOOGLE_DAILY_CAP = Number(process.env.NEODIO_GOOGLE_DAILY_CAP) || 150;
const DAILY_FILE = path.join(HOME_DIR, "daily-count.json");

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function googleCountToday(): number {
  try {
    const data = JSON.parse(readFileSync(DAILY_FILE, "utf8")) as { date: string; google: number };
    return data.date === todayKey() ? data.google : 0;
  } catch {
    return 0;
  }
}

function addGoogleCount(n: number) {
  writeFileSync(DAILY_FILE, JSON.stringify({ date: todayKey(), google: googleCountToday() + n }));
}

const BROWSER_CLOSED_EXIT_CODE = 4;
const MAX_ATTEMPTS = 3;

/** 캡차(3)·창 닫힘(4)이면 사용자가 볼 수 있는 Chrome 창으로 다시 시도한다 — 최대 MAX_ATTEMPTS번. */
async function runScriptWithRetry(job: CollectorJob, engine: CollectorEngine, keyword: string, outDir: string): Promise<number> {
  let code = await runScript(job, engine, keyword, outDir);
  for (let attempt = 2; attempt <= MAX_ATTEMPTS && !running?.cancelled; attempt++) {
    if (code === 3 && engine !== "google") {
      appendJobLog(job, "네이버 캡차 — Chrome 창을 띄웁니다. 창에서 캡차를 풀어 주세요(최대 5분).");
      code = await runScript(job, engine, keyword, outDir, ["--headed", "--captcha-wait-ms", "300000"]);
    } else if (code === BROWSER_CLOSED_EXIT_CODE) {
      appendJobLog(job, `Chrome 창이 중간에 닫혀 새 창으로 다시 시도합니다 (${attempt}/${MAX_ATTEMPTS}).`);
      await interruptibleSleep(3_000);
      code = await runScript(job, engine, keyword, outDir, engine === "google" ? [] : ["--headed", "--captcha-wait-ms", "300000"]);
    } else break;
  }
  return code;
}

async function runJob(job: CollectorJob) {
  job.status = "running";
  saveJob(job);
  if (job.kind === "sitemap-crawl" && job.crawl) return runCrawlJob(job, job.crawl);
  if (job.kind === "aio-collect" && job.aio) return runAioJob(job, job.aio);
  log(`▶ 수집 시작 ${job.id} — ${job.items.length}개, ${job.engines.join(", ")}`);
  mkdirSync(WORK_DIR, { recursive: true });
  let hasRunSearch = false;

  for (const item of job.items) {
    if (running?.cancelled) break;
    item.status = "running";
    const failures: string[] = [];
    for (const engine of job.engines) {
      if (running?.cancelled) break;
      item.engine = engine;
      saveJob(job);
      appendJobLog(job, `"${item.keyword}" ${ENGINE_NAME[engine]} 수집`);
      const outDir = path.join(RESULTS_DIR, job.id, `${engine}-ai`);
      mkdirSync(outDir, { recursive: true });
      const before = new Set(jsonFiles(outDir));
      if (engine === "google" && googleCountToday() >= GOOGLE_DAILY_CAP) {
        appendJobLog(job, `구글 하루 수집 상한(${GOOGLE_DAILY_CAP}건)에 도달해 건너뜁니다. 내일 다시 시도해 주세요.`);
        failures.push(ENGINE_SHORT[engine]);
        continue;
      }
      if (hasRunSearch) {
        const [min, max] = ENGINE_DELAY_MS[engine] ?? [0, 0];
        if (max > 0) await interruptibleSleep(min + Math.floor(Math.random() * (max - min + 1)));
        if (running?.cancelled) break;
      }
      hasRunSearch = true;
      const code = await runScriptWithRetry(job, engine, item.keyword, outDir);
      if (engine === "google") addGoogleCount(1);
      item.results += jsonFiles(outDir).filter((n) => !before.has(n)).length;
      if (code !== 0 && !running?.cancelled) failures.push(ENGINE_SHORT[engine]);
    }
    item.engine = null;
    if (running?.cancelled) item.status = "cancelled";
    else if (failures.length > 0) {
      item.status = "error";
      item.error = `${failures.join("·")} 수집 실패`;
    } else item.status = "done";
    saveJob(job);
  }

  const cancelled = !!running?.cancelled;
  for (const item of job.items) if (item.status === "pending") item.status = "cancelled";
  job.status = cancelled ? "cancelled" : "done";
  job.finishedAt = new Date().toISOString();
  saveJob(job);
  log(`■ 수집 ${cancelled ? "중단" : "완료"} ${job.id}`);
}

async function processQueue() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  const job = jobs.get(next);
  if (!job || job.status !== "queued") return processQueue();
  running = { jobId: job.id, child: null, cancelled: false };
  try {
    await runJob(job);
  } catch (error) {
    appendJobLog(job, `수집기 오류: ${error instanceof Error ? error.message : String(error)}`);
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
    saveJob(job);
  } finally {
    running = null;
  }
  void processQueue();
}

function cancelJob(job: CollectorJob): boolean {
  if (job.status === "queued") {
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
    for (const item of job.items) item.status = "cancelled";
    saveJob(job);
    return true;
  }
  if (job.status === "running" && running?.jobId === job.id) {
    running.cancelled = true;
    if (running.child) killChild(running.child);
    return true;
  }
  return false;
}

/** 이 작업이 만든 수집 결과 — 수집 스크립트가 쓴 JSON(promptRun)만. 화면 캡처·HTML은 이 PC에 남는다. */
function jobResults(job: CollectorJob): CollectorRunFile[] {
  const files: CollectorRunFile[] = [];
  for (const engine of job.engines) {
    const dir = path.join(RESULTS_DIR, job.id, `${engine}-ai`);
    for (const filename of jsonFiles(dir).sort()) {
      try {
        const parsed = JSON.parse(readFileSync(path.join(dir, filename), "utf8")) as { promptRun?: unknown };
        if (parsed.promptRun) files.push({ filename, promptRun: parsed.promptRun });
      } catch {
        // 쓰다 만 파일은 건너뛴다
      }
    }
  }
  return files;
}

/** 크롤 작업이 만든 결과 — 크롤 스크립트가 쓴 JSON(도메인·크롤 시각·URL별 지표). */
function jobCrawlResults(job: CollectorJob): CollectorCrawlResult[] {
  const dir = path.join(RESULTS_DIR, job.id, "sitemap-crawl");
  const crawls: CollectorCrawlResult[] = [];
  for (const filename of jsonFiles(dir).sort()) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(dir, filename), "utf8")) as CollectorCrawlResult;
      if (Array.isArray(parsed.urls) && parsed.crawledAt) crawls.push(parsed);
    } catch {
      // 쓰다 만 파일은 건너뛴다
    }
  }
  return crawls;
}

function status(): CollectorAgentStatus {
  return { app: "neodio-collector", version: COLLECTOR_VERSION, platform: platformId(), chrome: !!resolveChromePath(), runningJobId: running?.jobId ?? null };
}

// ---------- HTTP (127.0.0.1 전용) ----------

function send(res: http.ServerResponse, code: number, body: unknown, origin: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  res.writeHead(code, headers);
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

let shutdown: (() => void) | null = null;

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  // 다른 사이트가 이 주소로 우회해 들어오는 것(DNS rebinding)을 막는다.
  const host = (req.headers.host ?? "").toLowerCase();
  if (host !== `127.0.0.1:${AGENT_PORT}` && host !== `localhost:${AGENT_PORT}`) return send(res, 403, { error: "forbidden host" }, null);

  const origin = typeof req.headers.origin === "string" ? req.headers.origin : null;
  const originAllowed = !origin || allowedOrigins().has(origin);
  if (!originAllowed) return send(res, 403, { error: `허용되지 않은 화면입니다: ${origin}` }, null);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin ?? "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      // Chrome의 사설망 접근 제한 — https 사이트가 127.0.0.1을 부르려면 필요하다.
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
    return res.end();
  }

  const url = new URL(req.url ?? "/", `http://${host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/status") return send(res, 200, status(), origin);

  // 설치 명령(같은 PC의 터미널)이 기존 수집기를 내릴 때 — 웹 화면에선 부를 수 없다.
  if (req.method === "POST" && url.pathname === "/shutdown") {
    if (origin) return send(res, 403, { error: "forbidden" }, origin);
    send(res, 200, { ok: true }, null);
    shutdown?.();
    return;
  }

  if (parts[0] !== "jobs") return send(res, 404, { error: "not found" }, origin);

  if (parts.length === 1 && req.method === "GET") {
    const list = [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((job) => ({ ...job, log: job.log.slice(-20) }));
    return send(res, 200, { jobs: list }, origin);
  }

  if (parts.length === 1 && req.method === "POST") {
    // 브라우저가 보낸 간단 요청(폼 등)으로는 수집을 시킬 수 없게 JSON만 받는다.
    if (!String(req.headers["content-type"] ?? "").includes("application/json")) return send(res, 415, { error: "JSON만 받습니다." }, origin);
    const body = (await readBody(req)) as { keywords?: unknown; engines?: unknown; label?: unknown; kind?: unknown; crawl?: unknown; aio?: unknown } | null;
    if (body?.kind === "aio-collect") {
      const spec = parseAioSpec((body as { aio?: unknown }).aio);
      if ("error" in spec) return send(res, 400, { error: spec.error }, origin);
      return send(res, 200, { job: createAioJob(spec, typeof body?.label === "string" ? body.label.slice(0, 100) : "") }, origin);
    }
    if (body?.kind === "sitemap-crawl") {
      const spec = parseCrawlSpec(body.crawl);
      if ("error" in spec) return send(res, 400, { error: spec.error }, origin);
      return send(res, 200, { job: createCrawlJob(spec, typeof body?.label === "string" ? body.label.slice(0, 100) : "") }, origin);
    }
    const keywords = (Array.isArray(body?.keywords) ? body.keywords : [])
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean);
    const engines = (Array.isArray(body?.engines) ? body.engines : []).filter((e): e is CollectorEngine => e === "naver" || e === "naver-overview" || e === "google");
    if (keywords.length === 0 || keywords.length > MAX_KEYWORDS) return send(res, 400, { error: `키워드는 1~${MAX_KEYWORDS}개여야 합니다.` }, origin);
    if (engines.length === 0) return send(res, 400, { error: "엔진을 하나 이상 선택하세요." }, origin);
    const label = typeof body?.label === "string" ? body.label.slice(0, 100) : "";
    return send(res, 200, { job: createJob(keywords, [...new Set(engines)], label) }, origin);
  }

  const job = parts[1] ? jobs.get(parts[1]) : undefined;
  if (!job) return send(res, 404, { error: "작업을 찾을 수 없습니다." }, origin);

  if (parts.length === 2 && req.method === "GET") return send(res, 200, { job }, origin);
  if (parts.length === 3 && parts[2] === "results" && req.method === "GET") return send(res, 200, { runs: jobResults(job) }, origin);
  if (parts.length === 3 && parts[2] === "aio" && req.method === "GET") return send(res, 200, { results: jobAioResults(job) }, origin);
  if (parts.length === 3 && parts[2] === "crawl" && req.method === "GET") return send(res, 200, { crawls: jobCrawlResults(job) }, origin);
  if (parts.length === 3 && parts[2] === "cancel" && req.method === "POST") {
    return cancelJob(job) ? send(res, 200, { job }, origin) : send(res, 409, { error: "이미 끝난 작업입니다." }, origin);
  }
  if (parts.length === 3 && parts[2] === "applied" && req.method === "POST") {
    job.appliedAt = new Date().toISOString();
    saveJob(job);
    return send(res, 200, { job }, origin);
  }
  if (parts.length === 2 && req.method === "DELETE") {
    if (job.status === "running" || job.status === "queued") return send(res, 409, { error: "진행 중인 작업은 먼저 중단하세요." }, origin);
    jobs.delete(job.id);
    rmSync(jobFile(job.id), { force: true });
    rmSync(path.join(RESULTS_DIR, job.id), { recursive: true, force: true });
    return send(res, 200, { ok: true }, origin);
  }
  return send(res, 404, { error: "not found" }, origin);
}

async function fetchStatus(): Promise<CollectorAgentStatus | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${AGENT_PORT}/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as CollectorAgentStatus) : null;
  } catch {
    return null;
  }
}

async function run() {
  loadJobs();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(`요청 처리 오류: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) send(res, 500, { error: "수집기 오류" }, null);
    });
  });
  shutdown = () => {
    log("종료 요청을 받았습니다.");
    if (running) cancelJob(jobs.get(running.jobId)!);
    server.close();
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", () => shutdown?.());
  process.on("SIGTERM", () => shutdown?.());

  server.on("error", async (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && (await fetchStatus())?.app === "neodio-collector") {
      log("수집기가 이미 실행 중입니다.");
      process.exit(0);
    }
    log(`수집기를 시작하지 못했습니다: ${error.message}`);
    process.exit(1);
  });
  server.listen(AGENT_PORT, "127.0.0.1", () => {
    log(`수집기 ${COLLECTOR_VERSION} 실행 중 — http://127.0.0.1:${AGENT_PORT} (${platformId()}, Chrome ${resolveChromePath() ? "있음" : "없음"})`);
    log(`허용된 화면: ${[...allowedOrigins()].join(", ")}`);
  });
}

// ---------- 설치 ----------

async function stopRunningAgent() {
  try {
    await fetch(`http://127.0.0.1:${AGENT_PORT}/shutdown`, { method: "POST", signal: AbortSignal.timeout(3000) });
  } catch {
    // 실행 중이 아니면 그만
  }
  for (let i = 0; i < 20 && (await fetchStatus()); i++) await new Promise((r) => setTimeout(r, 250));
}

function macPlistPath() {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${MAC_AGENT_LABEL}.plist`);
}

function windowsStartupScript() {
  return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "neodio-collector.vbs");
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function registerAutostart(nodePath: string, agentPath: string) {
  if (process.platform === "darwin") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${MAC_AGENT_LABEL}</string>
  <key>ProgramArguments</key><array><string>${xmlEscape(nodePath)}</string><string>${xmlEscape(agentPath)}</string><string>run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${xmlEscape(path.join(LOG_DIR, "launchd.log"))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.join(LOG_DIR, "launchd.log"))}</string>
</dict></plist>
`;
    mkdirSync(path.dirname(macPlistPath()), { recursive: true });
    writeFileSync(macPlistPath(), plist);
    const domain = `gui/${process.getuid?.() ?? 501}`;
    spawnSync("launchctl", ["bootout", `${domain}/${MAC_AGENT_LABEL}`], { stdio: "ignore" });
    const result = spawnSync("launchctl", ["bootstrap", domain, macPlistPath()], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`자동 시작 등록 실패: ${result.stderr || result.stdout}`);
    return;
  }
  if (process.platform === "win32") {
    // 시작프로그램 폴더의 스크립트 — 관리자 권한 없이 로그인할 때 창 없이 실행된다.
    const vbs = `Set sh = CreateObject("WScript.Shell")\r\nsh.Run """${nodePath}"" ""${agentPath}"" run", 0, False\r\n`;
    mkdirSync(path.dirname(windowsStartupScript()), { recursive: true });
    writeFileSync(windowsStartupScript(), vbs);
    spawn("wscript.exe", [windowsStartupScript()], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  throw new Error("이 운영체제는 자동 시작 등록을 지원하지 않습니다. `run`으로 직접 실행하세요.");
}

function unregisterAutostart() {
  if (process.platform === "darwin") {
    spawnSync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${MAC_AGENT_LABEL}`], { stdio: "ignore" });
    rmSync(macPlistPath(), { force: true });
  } else if (process.platform === "win32") {
    rmSync(windowsStartupScript(), { force: true });
  }
}

async function install() {
  if (!BUNDLED) throw new Error("install은 배포본(설치 파일)에서만 씁니다. 개발 중에는 `npm run collector -- run`으로 실행하세요.");
  const bundleRoot = path.resolve(HERE, "..");
  mkdirSync(HOME_DIR, { recursive: true });

  const origins = argValues("origin");
  if (origins.length > 0) {
    const config = readConfig();
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...config, allowedOrigins: [...new Set([...config.allowedOrigins, ...origins])] }, null, 2));
  }

  log("기존 수집기를 멈추는 중…");
  await stopRunningAgent();

  if (path.resolve(bundleRoot) !== path.resolve(RUNTIME_DIR)) {
    log(`설치 위치로 복사: ${RUNTIME_DIR}`);
    rmSync(RUNTIME_DIR, { recursive: true, force: true });
    cpSync(bundleRoot, RUNTIME_DIR, { recursive: true });
    // 인터넷에서 받은 파일 표시를 지워야 macOS가 실행을 막지 않는다.
    if (process.platform === "darwin") spawnSync("xattr", ["-dr", "com.apple.quarantine", RUNTIME_DIR], { stdio: "ignore" });
  }
  const nodePath = path.join(RUNTIME_DIR, process.platform === "win32" ? "neodio-collector.exe" : "neodio-collector");
  const agentPath = path.join(RUNTIME_DIR, "app", "agent.mjs");
  registerAutostart(nodePath, agentPath);

  for (let i = 0; i < 40; i++) {
    const current = await fetchStatus();
    if (current) {
      log(`설치 완료 — 수집기 ${current.version}가 실행 중입니다. 로그인할 때마다 자동으로 시작됩니다.`);
      if (!current.chrome) log("⚠ Google Chrome을 찾지 못했습니다. Chrome을 설치해야 수집할 수 있습니다.");
      log("웹 화면으로 돌아가 '다시 확인'을 누르세요.");
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`수집기가 시작되지 않았습니다. 로그를 확인하세요: ${LOG_DIR}`);
}

async function uninstall() {
  await stopRunningAgent();
  unregisterAutostart();
  log(`자동 시작을 해제하고 수집기를 멈췄습니다. 수집 결과와 설정은 ${HOME_DIR}에 남아 있습니다.`);
}

async function printStatus() {
  const current = await fetchStatus();
  console.log(JSON.stringify({ home: HOME_DIR, running: current, allowedOrigins: [...allowedOrigins()] }, null, 2));
}

const command = process.argv[2] ?? "run";
const commands: Record<string, () => Promise<void>> = { run, install, uninstall, status: printStatus };
if (!commands[command]) {
  console.error(`알 수 없는 명령: ${command} (run | install | uninstall | status)`);
  process.exit(1);
}
commands[command]().catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
