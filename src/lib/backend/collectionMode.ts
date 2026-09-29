import type { CollectorPlatform } from "../collectorAgent";
import { COLLECTOR_VERSION } from "../collectorAgent";

// AI검색 수집을 어디서 돌리는지. 로컬 대시보드는 이 서버가 바로 실행하고,
// 운영(Vercel)은 실제 Chrome이 없어 사용자 PC의 설치형 수집기(collector/)에
// 브라우저를 다리 삼아 맡긴다(src/lib/collectorAgent.ts). 로컬에서도
// NEODIO_COLLECTION_MODE=agent로 켜서 운영과 같은 흐름을 시험할 수 있다.
export function collectionUsesLocalAgent(): boolean {
  return !!process.env.VERCEL || process.env.NEODIO_COLLECTION_MODE === "agent";
}

/**
 * 수집기 설치 파일 주소 — COLLECTOR_DOWNLOAD_BASE_URL 아래에 빌드 결과
 * (collector/build.mjs의 zip 이름 그대로)를 올려 둔다. 설정이 없으면 null.
 */
export function collectorDownloadUrl(platform: CollectorPlatform): string | null {
  const base = process.env.COLLECTOR_DOWNLOAD_BASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/neodio-collector-${platform}-${COLLECTOR_VERSION}.zip` : null;
}
