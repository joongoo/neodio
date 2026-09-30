import { NextResponse } from "next/server";
import { collectorDownloadsConfigured } from "@/lib/backend/collectionMode";
import type { CollectorPlatform } from "@/lib/collectorAgent";

const PLATFORMS: CollectorPlatform[] = ["mac-arm64", "mac-x64", "win-x64"];

// 설치 안내 창이 어떤 운영체제의 설치 파일을 받을 수 있는지 — 저장소가 연결돼 있으면 전부, 아니면 없음.
export async function GET() {
  return NextResponse.json({ platforms: collectorDownloadsConfigured() ? PLATFORMS : [] });
}
