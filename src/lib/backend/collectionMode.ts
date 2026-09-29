import { BlobNotFoundError, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { COLLECTOR_VERSION, type CollectorPlatform } from "../collectorAgent";

// AI검색 수집을 어디서 돌리는지. 로컬 대시보드는 이 서버가 바로 실행하고,
// 운영(Vercel)은 실제 Chrome이 없어 사용자 PC의 설치형 수집기(collector/)에
// 브라우저를 다리 삼아 맡긴다(src/lib/collectorAgent.ts). 로컬에서도
// NEODIO_COLLECTION_MODE=agent로 켜서 운영과 같은 흐름을 시험할 수 있다.
export function collectionUsesLocalAgent(): boolean {
  return !!process.env.VERCEL || process.env.NEODIO_COLLECTION_MODE === "agent";
}

// 설치 파일은 비공개 Vercel Blob 저장소(neodio-blob)의 collector/ 아래에
// collector/build.mjs의 zip 이름 그대로 둔다. 받기는 로그인한 화면에서만 —
// 서버가 몇 분짜리 임시 링크를 만들어 보낸다. 저장소를 프로젝트에 연결하면
// BLOB_STORE_ID가 생기고 SDK가 Vercel OIDC로 인증한다(예전 방식 저장소는
// BLOB_READ_WRITE_TOKEN). docs/collector.md
const DOWNLOAD_LINK_TTL_MS = 10 * 60_000;

export function collectorDownloadsConfigured(): boolean {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export function collectorPackagePath(platform: CollectorPlatform): string {
  return `collector/neodio-collector-${platform}-${COLLECTOR_VERSION}.zip`;
}

/** 설치 파일 임시 다운로드 주소. 저장소가 연결돼 있지 않거나 파일이 없으면 null. */
export async function collectorDownloadUrl(platform: CollectorPlatform): Promise<string | null> {
  if (!collectorDownloadsConfigured()) return null;
  const pathname = collectorPackagePath(platform);
  try {
    await head(pathname);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
  const validUntil = Date.now() + DOWNLOAD_LINK_TTL_MS;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, validUntil, access: "private" });
  return presignedUrl;
}
