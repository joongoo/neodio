import type { CollectorPlatform } from "./collectorAgent";

// 수집기 설치 안내는 운영체제별로 따로 보여 준다 — 감지된 OS를 먼저 고르되, 다른 PC에 설치할 때를 위해 언제든 바꿀 수 있다.
export type GuideOs = "mac" | "windows";

export const GUIDE_OS_LABEL: Record<GuideOs, string> = { mac: "macOS", windows: "Windows" };

/** OS별로 받을 설치 파일 — Mac은 칩(Apple 실리콘/Intel)에 따라 다르다. */
export const GUIDE_OS_PLATFORMS: Record<GuideOs, CollectorPlatform[]> = {
  mac: ["mac-arm64", "mac-x64"],
  windows: ["win-x64"],
};

/** 처음 보여 줄 OS: 감지한 설치 파일 종류 → 없으면 브라우저 정보 → 그래도 모르면 macOS. */
export function initialGuideOs(detected: CollectorPlatform | null | undefined, userAgent: string): GuideOs {
  if (detected?.startsWith("win")) return "windows";
  if (detected?.startsWith("mac")) return "mac";
  if (/Windows/i.test(userAgent)) return "windows";
  return "mac";
}
