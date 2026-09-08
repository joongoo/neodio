import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// 브랜드별 GSC refresh_token을 저장 — 수집 로그/추적 토픽과 같은 .tmp 실
// 파일 패턴. 실 서비스라면 암호화된 DB 컬럼에 둬야 하지만, 로컬 개발
// 단계에서는 .tmp(gitignore됨)로 충분하다. refresh_token은 절대 클라이언트
// 로 내려보내지 않는다 — 이 파일은 서버 전용 코드에서만 import.
const TOKEN_DIR = ".tmp/gsc-tokens";

export interface GscTokenRecord {
  brandId: string;
  refreshToken: string;
  accountEmail: string;
  property: string;
  connectedAt: string;
}

function filePathFor(brandId: string) {
  return path.join(process.cwd(), TOKEN_DIR, `${brandId}.json`);
}

export async function saveGscToken(record: GscTokenRecord): Promise<void> {
  await mkdir(path.join(process.cwd(), TOKEN_DIR), { recursive: true });
  await writeFile(filePathFor(record.brandId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function getGscToken(brandId: string): Promise<GscTokenRecord | null> {
  try {
    return JSON.parse(await readFile(filePathFor(brandId), "utf8")) as GscTokenRecord;
  } catch {
    return null;
  }
}

export async function deleteGscToken(brandId: string): Promise<void> {
  await unlink(filePathFor(brandId)).catch(() => {});
}
