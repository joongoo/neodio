import { YoutubeAioSetupGate } from "@/components/youtube-aio/YoutubeAioSetupGate";
import { YoutubeManageClient } from "@/components/youtube-manage/YoutubeManageClient";
import { loadVideoManageList } from "@/lib/backend/aio/videoManagePageData";

// 선택 브랜드·가져온 영상·수집 결과가 바뀔 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function YoutubeManagePage({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const data = await loadVideoManageList(await searchParams);
  if (data.kind === "setup") return <YoutubeAioSetupGate brandId={data.brandId} brandName={data.brandName} base={data.base} />;
  return <YoutubeManageClient data={data} />;
}
