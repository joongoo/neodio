// Run on Windows with Inno Setup 6 installed, after collector/build.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/lib/collectorAgent.ts"), "utf8");
const version = source.match(/COLLECTOR_VERSION = "([\d.]+)"/)?.[1];
if (!version) throw new Error("COLLECTOR_VERSION을 찾지 못했습니다.");
const bundle = path.join(root, "dist/collector", `neodio-collector-win-x64-${version}`);
if (!existsSync(path.join(bundle, "neodio-collector.exe"))) throw new Error("Windows 수집기 빌드를 먼저 실행하세요.");
const iscc = process.env.INNO_SETUP_COMPILER ?? "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe";
if (!existsSync(iscc)) throw new Error(`Inno Setup 6 컴파일러가 없습니다: ${iscc}`);
const result = spawnSync(iscc, [
  `/DCollectorVersion=${version}`,
  `/DCollectorSource=${bundle}`,
  `/DCollectorOutput=${path.join(root, "dist/collector")}`,
  path.join(root, "collector/windows-installer.iss"),
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
