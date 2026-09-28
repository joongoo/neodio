import { YoutubeAioClient } from "@/components/youtube-aio/YoutubeAioClient";
import { YoutubeAioSetupGate } from "@/components/youtube-aio/YoutubeAioSetupGate";
import { loadAioOverviewPage } from "@/lib/backend/aio/pageData";

// 선택 브랜드·수집 결과가 바뀔 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function YoutubeAioPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; device?: string; group?: string; base?: string }>;
}) {
  const data = await loadAioOverviewPage(await searchParams);
  if (data.kind === "setup") return <YoutubeAioSetupGate brandId={data.brandId} brandName={data.brandName} />;
  return <YoutubeAioClient data={data} />;
}
