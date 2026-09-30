import { notFound } from "next/navigation";
import { YoutubeAioSetupGate } from "@/components/youtube-aio/YoutubeAioSetupGate";
import { YoutubeManageDetailClient } from "@/components/youtube-manage/YoutubeManageDetailClient";
import { loadVideoManageDetail } from "@/lib/backend/aio/videoManagePageData";

export const dynamic = "force-dynamic";

export default async function YoutubeManageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ device?: string }>;
}) {
  const { videoId } = await params;
  const data = await loadVideoManageDetail(decodeURIComponent(videoId), await searchParams);
  if (data.kind === "setup") return <YoutubeAioSetupGate brandId={data.brandId} brandName={data.brandName} base={data.base} />;
  if (data.kind === "not_found") notFound();
  return <YoutubeManageDetailClient data={data} />;
}
