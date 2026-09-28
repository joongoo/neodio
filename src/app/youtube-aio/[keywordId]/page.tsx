import { notFound } from "next/navigation";
import { AioKeywordDetailClient } from "@/components/youtube-aio/AioKeywordDetailClient";
import { YoutubeAioSetupGate } from "@/components/youtube-aio/YoutubeAioSetupGate";
import { loadAioKeywordDetailPage } from "@/lib/backend/aio/pageData";

export const dynamic = "force-dynamic";

export default async function YoutubeAioKeywordPage({
  params,
  searchParams,
}: {
  params: Promise<{ keywordId: string }>;
  searchParams: Promise<{ device?: string }>;
}) {
  const { keywordId } = await params;
  const data = await loadAioKeywordDetailPage(decodeURIComponent(keywordId), await searchParams);
  if (data.kind === "setup") return <YoutubeAioSetupGate brandId={data.brandId} brandName={data.brandName} />;
  if (data.kind === "not_found") notFound();
  return <AioKeywordDetailClient data={data} />;
}
