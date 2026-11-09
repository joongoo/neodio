import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { windowsStartupVbs } from "./windowsStartup";

test("Windows startup uses real CRLF and a Unicode BOM", () => {
  const bytes = windowsStartupVbs('C:\\사용자 이름\\runtime\\node.exe', 'C:\\사용자 이름\\app\\agent.mjs');
  assert.equal(bytes.readUInt16LE(0), 0xfeff);
  const source = bytes.toString("utf16le");
  assert.ok(source.includes("\r\nsh.Run"));
  assert.ok(!source.includes("\\r\\n"));
  assert.ok(source.includes('""C:\\사용자 이름\\runtime\\node.exe""'));
});

test("WScript executes from a Korean path containing spaces", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "네오디오 시작 테스트 "));
  const marker = path.join(dir, "실행 결과.json");
  const agent = path.join(dir, "테스트 agent.mjs");
  const vbs = path.join(dir, "시작.vbs");
  try {
    writeFileSync(agent, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));`);
    writeFileSync(vbs, windowsStartupVbs(process.execPath, agent));
    const result = spawnSync("cscript.exe", ["//nologo", vbs], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(JSON.parse(readFileSync(marker, "utf8")), ["run"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
