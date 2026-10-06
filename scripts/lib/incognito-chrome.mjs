import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

// Real Chrome install paths per OS — Google collection must always run
// through a real, incognito Chrome (headless Playwright chromium hits
// Google's captcha wall), so this needs to resolve on whichever machine
// runs it, not just this one. Shared by collect-google-ai.mjs (AI Mode) and
// collect-google-aio.mjs (AI Overview).
const CHROME_PATH_CANDIDATES = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/google-chrome"],
};

export function resolveChromePath() {
  const candidates = CHROME_PATH_CANDIDATES[process.platform] ?? [];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

// 디버그 포트의 Chrome이 살아 있는지 — 빈 탭을 하나 열었다 닫아 본다.
async function isDebugChromeHealthy(endpoint) {
  try {
    const res = await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return false;
    const tab = await res.json();
    await fetch(`${endpoint}/json/close/${tab.id}`, { signal: AbortSignal.timeout(2_000) }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// 응답 없는 이전 Chrome을 CDP Browser.close로 종료하고 포트가 비워질 때까지 기다린다.
async function closeStaleDebugChrome(webSocketUrl, endpoint) {
  if (webSocketUrl && typeof WebSocket !== "undefined") {
    await new Promise((resolve) => {
      const done = () => resolve();
      try {
        const ws = new WebSocket(webSocketUrl);
        ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
        ws.onclose = done;
        ws.onerror = done;
        setTimeout(done, 3_000);
      } catch {
        done();
      }
    });
  }
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    if (!(await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) }).then((res) => res.ok, () => false))) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`이전에 남은 수집용 Chrome이 응답하지 않고 종료되지 않습니다. 열려 있는 Chrome 창을 모두 닫고(작업 관리자/활동 모니터에서 Chrome 종료) 다시 시도해 주세요.`);
}

// Spawns a fresh, disposable incognito Chrome with a CDP debug port and
// waits for it to come up. Returns the caller's own endpoint untouched when
// one is given (an already-open debug session).
export async function ensureIncognitoCdpEndpoint(explicitEndpoint, { port, profilePrefix, missingChromeMessage, proxy = null, persistentProfileDir = null }) {
  if (explicitEndpoint) return { endpoint: explicitEndpoint, ownedProcess: null, profileDir: null };

  const liveEndpoint = `http://127.0.0.1:${port}`;
  // 이전 --keep-open 실행이 남긴 창이 그 포트를 쥐고 있으면 새 Chrome은 포트를 못 잡는다 — 남은 창을 그대로 쓴다.
  // 단, 멈춘 창(about:blank에서 굳은 Chrome 등)을 재사용하면 재시도해도 계속 실패하므로 새 탭이 실제로 열리는지 확인하고, 아니면 닫고 새로 띄운다.
  const live = await fetch(`${liveEndpoint}/json/version`).then((res) => (res.ok ? res.json() : null), () => null);
  if (live) {
    if (await isDebugChromeHealthy(liveEndpoint)) return { endpoint: liveEndpoint, ownedProcess: null, profileDir: null };
    await closeStaleDebugChrome(live.webSocketDebuggerUrl, liveEndpoint);
  }

  const chromePath = resolveChromePath();
  if (!chromePath) throw new Error(missingChromeMessage);

  // Absolute on purpose: Chrome on Windows doesn't resolve a relative
  // --user-data-dir against the spawning cwd, and never opens the debug port.
  // persistentProfileDir가 있으면 검색마다 지우지 않는 전용 프로필로 띄운다 — 캡차를 푼 쿠키가 남아 다음 검색에서 다시 걸리지 않는다.
  const profileDir = persistentProfileDir ? path.resolve(persistentProfileDir) : path.resolve(".tmp", `${profilePrefix}-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });

  const child = spawn(
    chromePath,
    [...(persistentProfileDir ? ["--no-first-run", "--no-default-browser-check"] : ["--incognito"]), `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, ...(proxy ? [`--proxy-server=${proxy}`] : []), "about:blank"],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${endpoint}/json/version`);
      if (res.ok) return { endpoint, ownedProcess: child, profileDir: persistentProfileDir ? null : profileDir };
    } catch {
      // Chrome still starting up
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("수집용 Chrome이 시작되지 않습니다(디버그 포트 응답 없음). 같은 프로필을 쓰는 Chrome이 이미 떠 있으면 모두 종료한 뒤 다시 시도해 주세요.");
}

// Kills the Chrome we spawned and deletes its throwaway profile. Negative-pid
// process-group kill is POSIX-only; on Windows it throws and silently leaves
// Chrome running, so use taskkill /T to take the whole renderer/GPU process
// tree down with it. Each run gets a fresh --user-data-dir (thousands of
// files), so without the cleanup .tmp grows by one profile per search.
export function killOwnedChrome(ownedProcess, profileDir = null) {
  if (ownedProcess?.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(ownedProcess.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-ownedProcess.pid);
      } catch {
        // already exited
      }
    }
  }
  if (profileDir) {
    // Windows keeps Chrome's file locks for a moment after the process tree
    // exits (EPERM on the first try) — keep retrying for a few seconds.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        rmSync(profileDir, { recursive: true, force: true });
        return;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      }
    }
    // best effort; a leftover profile only costs disk space
  }
}

// 수집 중 창·탭·브라우저가 닫힌 오류인지 — 수집기가 새 창으로 다시 시도할 수 있게 구분한다.
export const BROWSER_CLOSED_EXIT_CODE = 4;
export function isBrowserClosedError(error) {
  return /Target page, context or browser has been closed|Browser has been closed|browser has disconnected|Target closed|Connection closed/i.test(
    error instanceof Error ? error.message : String(error)
  );
}

// 기기별 전용 Chrome 프로필 위치 — 수집기 설치 폴더 아래에 둔다.
export function chromeProfileDir(device) {
  const home = process.env.NEODIO_COLLECTOR_HOME || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".neodio-collector");
  return path.join(home, `chrome-profile-${device}`);
}
