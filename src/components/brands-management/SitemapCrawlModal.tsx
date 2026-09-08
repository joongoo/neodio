"use client";

import { Check, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { SitemapCrawlJob, SitemapCrawlStage } from "@/lib/backend/sitemapCrawlJobTypes";

const STAGE_LABEL: Record<Exclude<SitemapCrawlStage, "done" | "error">, string> = {
  install: "크롤 도구 설치 중",
  sitemap: "사이트맵 파싱 중",
  crawl: "페이지별 콘텐츠 가시성 크롤 중",
};
const STEPS: (keyof typeof STAGE_LABEL)[] = ["install", "sitemap", "crawl"];

export function SitemapCrawlModal({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: () => void;
  status: Pick<SitemapCrawlJob, "stage" | "log" | "error" | "result"> | null;
}) {
  if (!status) return null;
  const { stage, log, error, result } = status;

  if (stage === "done") {
    return (
      <Modal open={open} onClose={onClose}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleCheck size={20} className="text-emerald-500" />
            <h2 className="text-lg font-bold text-neutral-900">사이트맵 크롤 완료</h2>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {result?.urlCount ?? 0}개 URL을 크롤했고, 평균 콘텐츠 가시성은 {result?.averageContentVisibility ?? 0}%입니다.
        </p>

        <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="text-left text-neutral-500">
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">가시성</th>
                <th className="px-3 py-2 font-medium">Raw / 렌더링 텍스트</th>
              </tr>
            </thead>
            <tbody>
              {result?.urls.map((u) => (
                <tr key={u.url} className="border-t border-neutral-100">
                  <td className="max-w-[280px] truncate px-3 py-2 text-neutral-700" title={u.url}>
                    {u.url}
                  </td>
                  <td className="px-3 py-2">
                    {u.status === "success" ? (
                      <span
                        className={`font-bold ${u.contentVisibility < 50 ? "text-red-600" : u.contentVisibility < 80 ? "text-amber-600" : "text-emerald-600"}`}
                      >
                        {u.contentVisibility}%
                      </span>
                    ) : (
                      <span className="text-neutral-400">실패</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {u.status === "success" ? `${u.rawTextLength} / ${u.renderedTextLength}자` : u.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 self-end rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90"
        >
          확인
        </button>
      </Modal>
    );
  }

  if (stage === "error") {
    return (
      <Modal open={open} onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <TriangleAlert size={40} className="text-red-500" />
          <h2 className="text-lg font-bold text-neutral-900">사이트맵 크롤 실패</h2>
          <p className="rounded-md bg-red-50 p-3 text-xs text-red-700">{error}</p>
          {log.length > 0 && (
            <pre className="max-h-32 w-full overflow-y-auto rounded-md bg-neutral-50 p-3 text-left text-[11px] leading-relaxed text-neutral-500">
              {log.slice(-8).join("\n")}
            </pre>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 h-10 rounded-md bg-neutral-200 px-6 text-sm font-bold text-neutral-700 cursor-pointer hover:bg-neutral-300"
          >
            닫기
          </button>
        </div>
      </Modal>
    );
  }

  const currentIndex = STEPS.indexOf(stage as keyof typeof STAGE_LABEL);

  return (
    <Modal open={open} onClose={() => {}}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">사이트맵 크롤 진행 중</h2>
          <p className="mt-1 text-xs text-neutral-500">완료될 때까지 이 창을 닫지 않아도 백그라운드에서 계속 진행됩니다.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          {STEPS.map((step, i) => {
            const isDone = i < currentIndex;
            const isActive = i === currentIndex;
            return (
              <div key={step} className="flex items-center gap-2.5 text-sm">
                {isDone ? (
                  <Check size={16} className="shrink-0 text-emerald-600" />
                ) : isActive ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-slate-600" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border-2 border-neutral-200" />
                )}
                <span className={isDone ? "text-neutral-400 line-through" : isActive ? "font-semibold text-neutral-900" : "text-neutral-400"}>
                  {STAGE_LABEL[step]}
                </span>
              </div>
            );
          })}
        </div>

        {log.length > 0 && (
          <pre className="max-h-32 overflow-y-auto rounded-md bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-500">
            {log.slice(-8).join("\n")}
          </pre>
        )}
      </div>
    </Modal>
  );
}
