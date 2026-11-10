// Cross-platform upload; never print credentials. Upload all platforms before deploying the web version.
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { head, put } from "@vercel/blob";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const source = readFileSync(path.join(root, "src/lib/collectorAgent.ts"), "utf8");
  const version = source.match(/export const COLLECTOR_VERSION = "([\d.]+)"/)?.[1];
  if (!version) throw new Error("COLLECTOR_VERSION을 찾지 못했습니다.");
  const files = ["mac-arm64", "mac-x64", "win-x64"].map((platform) => {
    const name = platform === "win-x64"
      ? `neodio-collector-win-x64-${version}-setup.exe`
      : `neodio-collector-${platform}-${version}.zip`;
    const file = path.join(root, "dist/collector", name);
    if (!existsSync(file)) throw new Error(`${name}이 없습니다. 먼저 모든 플랫폼을 빌드하세요.`);
    return { file, pathname: `collector/${name}` };
  });
  if (!process.env.BLOB_READ_WRITE_TOKEN && process.platform === "darwin") {
    const result = spawnSync("security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", "neodio-blob-rw", "-w"], { encoding: "utf8" });
    if (result.status === 0) process.env.BLOB_READ_WRITE_TOKEN = result.stdout.trim();
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    throw new Error("Blob 인증이 없습니다. BLOB_READ_WRITE_TOKEN 또는 BLOB_STORE_ID와 VERCEL_OIDC_TOKEN을 환경변수에 설정하세요.");
  }
  for (const { file, pathname } of files) {
    await put(pathname, createReadStream(file), {
      access: "private", addRandomSuffix: false, allowOverwrite: true,
      contentType: pathname.endsWith(".exe") ? "application/octet-stream" : "application/zip",
    });
    const uploaded = await head(pathname);
    if (uploaded.size !== statSync(file).size) throw new Error(`업로드 크기 검증 실패: ${pathname}`);
    console.log(`업로드 및 크기 검증 완료: ${pathname} (${uploaded.size} bytes)`);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
