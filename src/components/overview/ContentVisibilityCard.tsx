import Link from "next/link";
import { Radar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ContentVisibility } from "@/lib/db";

// Matches Figma "Content Visibility Card" (node 646:11318, Korean page):
// gauge | headline + CTA button | light-blue callout, as three columns.
// `emptyReason` swaps the gauge for a dashed placeholder — no crawl has
// run yet, so a percent here would look measured when it isn't.
export function ContentVisibilityCard({ data }: { data: ContentVisibility }) {
  return (
    <Card className="flex flex-wrap items-stretch gap-6">
      <div className="flex flex-col items-center gap-2.5">
        {data.emptyReason ? (
          <div className="grid size-[140px] shrink-0 place-items-center rounded-full border-2 border-dashed border-neutral-200">
            <div className="grid size-[116px] place-items-center rounded-full bg-white text-center">
              <Radar size={22} className="text-neutral-300" />
              <span className="mt-1 text-[10px] font-medium text-neutral-400">측정 안 됨</span>
            </div>
          </div>
        ) : (
          <div
            className="grid size-[140px] shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#dc2626 0 ${data.visiblePercent}%, #f1f5f9 ${data.visiblePercent}% 100%)`,
            }}
          >
            <div className="grid size-[116px] place-items-center rounded-full bg-white text-center">
              <span className="text-[26px] font-bold text-neutral-900">{data.visiblePercent}%</span>
              <span className="text-[10px] font-medium text-neutral-500">콘텐츠 가시성</span>
            </div>
          </div>
        )}
        <p className="max-w-[214px] text-center text-[10px] font-medium text-neutral-500">{data.statusLabel}</p>
      </div>

      <div className="flex min-w-[220px] flex-1 flex-col justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-[17px] font-bold text-neutral-900">{data.headline}</p>
          <p className="text-[13px] text-neutral-500">{data.detail}</p>
        </div>
        {data.buttonHref ? (
          <Link href={data.buttonHref}>
            <Button variant="detail" size="md" className="self-start">
              {data.buttonLabel}
            </Button>
          </Link>
        ) : (
          <Button variant="detail" size="md" className="self-start">
            {data.buttonLabel}
          </Button>
        )}
      </div>

      <div className="flex w-[220px] shrink-0 flex-col justify-center gap-2 rounded-lg bg-blue-50 px-4 py-6">
        <p className="text-[13px] font-bold text-neutral-900">{data.cta.title}</p>
        <p className="text-xs text-neutral-600">{data.cta.detail}</p>
      </div>
    </Card>
  );
}
