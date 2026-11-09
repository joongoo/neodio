import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { COLLECTOR_VERSION } from "../src/lib/collectorAgent";

test("Windows bundle installs, reinstalls and starts through the login script", { skip: process.platform !== "win32", timeout: 60_000 }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "네오디오 설치 테스트 "));
  const home = path.join(dir, "수집기 데이터");
  const appdata = path.join(dir, "사용자 설정");
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NEODIO_COLLECTOR_HOME: home, NEODIO_COLLECTOR_PORT: String(port), APPDATA: appdata };
  const bundle = path.resolve(process.env.NEODIO_TEST_BUNDLE ?? `dist/collector/neodio-collector-win-x64-${COLLECTOR_VERSION}`);
  const node = path.join(bundle, "neodio-collector.exe");
  const script = path.join(bundle, "app/agent.mjs");
  const startup = path.join(appdata, "Microsoft/Windows/Start Menu/Programs/Startup/neodio-collector.vbs");
  const command = (cmd: string) => {
    const result = spawnSync(node, [script, cmd], { env, encoding: "utf8", windowsHide: true, timeout: 25_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  async function status() {
    // 재시작 전 서버의 keep-alive 소켓을 재사용하지 않고 새 프로세스를 확인한다.
    try { return await (await fetch(`${url}/status`, { headers: { Connection: "close" }, signal: AbortSignal.timeout(1000) })).json(); }
    catch { return null; }
  }
  async function stop() {
    if (await status()) await fetch(`${url}/shutdown`, { method: "POST" });
    for (let i = 0; i < 40 && await status(); i++) await new Promise((r) => setTimeout(r, 100));
    // shutdown allows existing sockets 1.5s to close before exiting.
    await new Promise((r) => setTimeout(r, 1800));
  }
  try {
    assert.match(command("install"), /설치 완료/);
    assert.equal((await status()).version, COLLECTOR_VERSION);
    const origin = "https://neodio.vercel.app";
    const webStatus = await fetch(`${url}/status`, { headers: { Origin: origin } });
    assert.equal(webStatus.status, 200);
    assert.equal(webStatus.headers.get("Access-Control-Allow-Origin"), origin);
    const preflight = await fetch(`${url}/jobs`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Private-Network": "true" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Private-Network"), "true");
    assert.equal((await fetch(`${url}/status`, { headers: { Origin: "https://untrusted.example" } })).status, 403);
    assert.ok(existsSync(path.join(home, "logs/launch.log")));
    assert.equal(readFileSync(startup).readUInt16LE(0), 0xfeff);
    assert.match(command("install"), /설치 완료/);
    assert.equal((await status()).app, "neodio-collector");
    await stop();
    const launch = spawnSync("cscript.exe", ["//nologo", startup], { env, encoding: "utf8", windowsHide: true, timeout: 10_000 });
    assert.equal(launch.status, 0, launch.stdout + launch.stderr);
    for (let i = 0; i < 50 && !await status(); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal((await status())?.version, COLLECTOR_VERSION);
    command("uninstall");
    assert.equal(await status(), null);
    assert.equal(existsSync(startup), false);
  } catch (error) {
    for (const name of ["agent.log", "launch.log"]) {
      const file = path.join(home, "logs", name);
      if (existsSync(file)) console.error(`${name}:\n${readFileSync(file, "utf8")}`);
    }
    throw error;
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
