// 수집기 설치 파일 만들기 — 운영체제별 zip 하나에 Node 런타임, 번들한 수집기
// (collector/agent.ts)와 수집 스크립트, Playwright(설치된 Chrome을 조종하는 용도),
// 더블클릭 설치 파일을 담는다. 받는 PC에는 Node도 저장소도 필요 없다(Chrome만).
//
//   node collector/build.mjs --origin https://<운영 주소> [--platform mac-arm64 --platform win-x64]
//   node collector/build.mjs --local-node      # 이 PC용만, 지금 쓰는 node로(다운로드 없이 시험)
//
// 결과: dist/collector/neodio-collector-<platform>-<version>.zip — 비공개 Blob 저장소의
// collector/ 아래에 이 이름 그대로 올리면 선택 수집 화면에서 받을 수 있다(docs/collector.md).
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "collector");
const CACHE = path.join(ROOT, ".tmp", "collector-build");
const NODE_VERSION = "22.23.3";
const PLATFORMS = {
  "mac-arm64": { node: `node-v${NODE_VERSION}-darwin-arm64`, archive: "tar.gz", exe: "node" },
  "mac-x64": { node: `node-v${NODE_VERSION}-darwin-x64`, archive: "tar.gz", exe: "node" },
  "win-x64": { node: `node-v${NODE_VERSION}-win-x64`, archive: "zip", exe: "node.exe" },
};

// 번들 안 Node 실행 파일의 이름 — macOS "로그인 항목/백그라운드 허용"과 작업 관리자에 이 이름이 보인다.
const RUNTIME_NAME = { "mac-arm64": "neodio-collector", "mac-x64": "neodio-collector", "win-x64": "neodio-collector.exe" };

function args(name) {
  return process.argv.flatMap((arg, i) => (arg === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]] : arg.startsWith(`--${name}=`) ? [arg.slice(name.length + 3)] : []));
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} 실패`);
}

function currentPlatform() {
  if (process.platform === "darwin") return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (process.platform === "win32") return "win-x64";
  throw new Error("이 PC용 --local-node는 macOS/Windows에서만 됩니다.");
}

function collectorVersion() {
  const source = readFileSync(path.join(ROOT, "src", "lib", "collectorAgent.ts"), "utf8");
  const version = source.match(/COLLECTOR_VERSION = "([\d.]+)"/)?.[1];
  if (!version) throw new Error("COLLECTOR_VERSION을 찾지 못했습니다.");
  return version;
}

/** 공식 Node 배포본에서 실행 파일만 꺼낸다(내려받은 파일은 .tmp에 보관해 다시 쓴다). */
async function nodeBinary(platform) {
  const spec = PLATFORMS[platform];
  const target = path.join(CACHE, spec.node, spec.exe);
  if (existsSync(target)) return target;
  mkdirSync(CACHE, { recursive: true });
  const archive = path.join(CACHE, `${spec.node}.${spec.archive}`);
  if (!existsSync(archive)) {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${spec.node}.${spec.archive}`;
    console.log(`Node 런타임 받는 중: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Node 런타임을 받지 못했습니다 (${res.status}): ${url}`);
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  }
  mkdirSync(path.dirname(target), { recursive: true });
  if (spec.archive === "zip") {
    run("unzip", ["-o", "-j", archive, `${spec.node}/${spec.exe}`, "-d", path.dirname(target)], { stdio: "ignore" });
  } else {
    run("tar", ["-xzf", archive, "-C", CACHE, `${spec.node}/bin/node`]);
    copyFileSync(path.join(CACHE, spec.node, "bin", "node"), target);
  }
  return target;
}

async function bundle(appDir, origins) {
  const common = { bundle: true, platform: "node", format: "esm", target: "node22", external: ["playwright", "playwright-core"], logLevel: "warning" };
  await build({
    ...common,
    entryPoints: [path.join(ROOT, "collector", "agent.ts")],
    outfile: path.join(appDir, "agent.mjs"),
    define: { __COLLECTOR_ORIGINS__: JSON.stringify(origins) },
  });
  for (const script of ["collect-naver-ai.mjs", "collect-google-ai.mjs", "crawl-sitemap.mjs"]) {
    await build({ ...common, entryPoints: [path.join(ROOT, "scripts", script)], outfile: path.join(appDir, script) });
  }
  writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ name: "neodio-collector-app", private: true, type: "module" }, null, 2));
  // Playwright는 설치된 Chrome을 조종하는 데만 쓴다(브라우저 자체는 넣지 않는다).
  for (const pkg of ["playwright", "playwright-core"]) {
    cpSync(path.join(ROOT, "node_modules", pkg), path.join(appDir, "node_modules", pkg), { recursive: true, dereference: true });
  }
}

function writeLaunchers(dir, platform, version) {
  if (platform.startsWith("mac")) {
    const installer = path.join(dir, "install.command");
    writeFileSync(
      installer,
      `#!/bin/sh\ncd "$(dirname "$0")"\nxattr -dr com.apple.quarantine . 2>/dev/null\n./neodio-collector app/agent.mjs install "$@"\necho\nread -p "Enter 키를 누르면 창이 닫힙니다." _\n`
    );
    const uninstaller = path.join(dir, "uninstall.command");
    writeFileSync(uninstaller, `#!/bin/sh\ncd "$(dirname "$0")"\n./neodio-collector app/agent.mjs uninstall\necho\nread -p "Enter 키를 누르면 창이 닫힙니다." _\n`);
    for (const file of [installer, uninstaller, path.join(dir, RUNTIME_NAME[platform])]) chmodSync(file, 0o755);
  } else {
    writeFileSync(path.join(dir, "install.cmd"), `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nneodio-collector.exe app\\agent.mjs install %*\r\necho.\r\npause\r\n`);
    writeFileSync(path.join(dir, "uninstall.cmd"), `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nneodio-collector.exe app\\agent.mjs uninstall\r\necho.\r\npause\r\n`);
  }
  writeFileSync(
    path.join(dir, "README.txt"),
    [
      `네오디오 수집기 ${version}`,
      "",
      platform.startsWith("mac")
        ? "설치: install.command를 더블클릭 → 차단되면 시스템 설정 > 개인정보 보호 및 보안 > 맨 아래로 스크롤 > 그래도 열기"
        : "설치: zip을 '모두 압축 풀기'로 푼 폴더에서 install.cmd를 더블클릭 (파란 'Windows의 PC 보호' 창이 뜨면 추가 정보 > 실행)",
      "설치하면 로그인할 때마다 자동으로 실행되고, 웹의 '선택 수집'이 이 PC의 Chrome으로 수집합니다.",
      "Google Chrome이 설치돼 있어야 합니다.",
      platform.startsWith("mac") ? "제거: uninstall.command" : "제거: uninstall.cmd",
      "",
    ].join(platform.startsWith("mac") ? "\n" : "\r\n")
  );
}

async function main() {
  const local = process.argv.includes("--local-node");
  const platforms = local ? [currentPlatform()] : args("platform").length ? args("platform") : Object.keys(PLATFORMS);
  for (const p of platforms) if (!PLATFORMS[p]) throw new Error(`알 수 없는 플랫폼: ${p} (${Object.keys(PLATFORMS).join(", ")})`);
  const origins = args("origin").map((o) => o.replace(/\/+$/, ""));
  if (!local && origins.length === 0) throw new Error("--origin <운영 웹 주소>가 필요합니다 — 그 주소의 화면만 수집기를 부를 수 있습니다.");
  const version = collectorVersion();
  mkdirSync(OUT, { recursive: true });

  for (const platform of platforms) {
    const name = `neodio-collector-${platform}-${version}`;
    const dir = path.join(OUT, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.join(dir, "app"), { recursive: true });
    console.log(`▶ ${name}`);
    await bundle(path.join(dir, "app"), origins);
    copyFileSync(local ? process.execPath : await nodeBinary(platform), path.join(dir, RUNTIME_NAME[platform]));
    writeLaunchers(dir, platform, version);
    const zip = path.join(OUT, `${name}.zip`);
    rmSync(zip, { force: true });
    // -y: 심볼릭 링크 보존, -X: macOS 부가 속성 제외
    run("zip", ["-qryX", zip, name], { cwd: OUT });
    console.log(`  → ${path.relative(ROOT, zip)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
