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

// Spawns a fresh, disposable incognito Chrome with a CDP debug port and
// waits for it to come up. Returns the caller's own endpoint untouched when
// one is given (an already-open debug session).
export async function ensureIncognitoCdpEndpoint(explicitEndpoint, { port, profilePrefix, missingChromeMessage }) {
  if (explicitEndpoint) return { endpoint: explicitEndpoint, ownedProcess: null, profileDir: null };

  const liveEndpoint = `http://127.0.0.1:${port}`;
  // 이전 --keep-open 실행이 남긴 창이 그 포트를 쥐고 있으면 새 Chrome은 포트를 못 잡는다 — 남은 창을 그대로 쓴다.
  if (await fetch(`${liveEndpoint}/json/version`).then((res) => res.ok, () => false)) {
    return { endpoint: liveEndpoint, ownedProcess: null, profileDir: null };
  }

  const chromePath = resolveChromePath();
  if (!chromePath) throw new Error(missingChromeMessage);

  // Absolute on purpose: Chrome on Windows doesn't resolve a relative
  // --user-data-dir against the spawning cwd, and never opens the debug port.
  const profileDir = path.resolve(".tmp", `${profilePrefix}-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });

  const child = spawn(
    chromePath,
    ["--incognito", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "about:blank"],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${endpoint}/json/version`);
      if (res.ok) return { endpoint, ownedProcess: child, profileDir };
    } catch {
      // Chrome still starting up
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting for the incognito Chrome debug port to become ready.");
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
