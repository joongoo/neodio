import { ArrowRight, SquarePlay } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// YouTube 채널이 연동되지 않은 브랜드로 들어오면 대시보드 대신 보여준다 —
// 판정 기준(채널 ID)이 없으면 보여줄 수 있는 게 없으므로, 닫을 수 있는
// 배너가 아니라 연동이 끝날 때까지 이 화면이 유지된다.
export function YoutubeAioSetupGate({ brandId, brandName, base }: { brandId: string | null; brandName: string | null; base: string }) {
  const href = brandId ? `${base}/brands-management/${brandId}/connections#youtube` : `${base}/brands-management`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">YouTube AIO 인용</h1>
        <p className="mt-1 text-sm text-neutral-500">브랜드 YouTube 영상이 Google AI Overview에 인용되는지 키워드별로 추적합니다.</p>
      </div>

      <Card className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-neutral-100">
          <SquarePlay size={22} className="text-neutral-600" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-bold text-neutral-900">YouTube 채널 연동 필요</p>
          <p className="max-w-md text-sm text-neutral-500">
            {brandName ? (
              <>
                <b>{brandName}</b>의 YouTube 채널을 연결해야 AI Overview에 인용된 영상이 우리 채널 영상인지 판정할 수 있습니다.
              </>
            ) : (
              "브랜드를 먼저 등록하고 YouTube 채널을 연결하세요."
            )}{" "}
            연결 후 추적할 키워드를 추가하면 매일 수집이 시작됩니다.
          </p>
        </div>
        <Button variant="primary" href={href} icon={<ArrowRight size={16} />} iconPosition="end">
          {brandId ? "브랜드 관리에서 연동하기" : "브랜드 관리로 이동"}
        </Button>
      </Card>
    </div>
  );
}
