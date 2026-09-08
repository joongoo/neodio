"use client";

import { Check, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CollectionStage } from "@/lib/backend/collectionJobTypes";

const STAGE_LABEL: Record<Exclude<CollectionStage, "done" | "error">, string> = {
  install: "수집 도구 설치 중",
  naver: "네이버 엔진 검색 수집 중",
  google: "구글 엔진 검색 수집 중",
  save: "수집한 내용 저장 중",
};

const ENGINE_LABEL: Record<"naver" | "google", string> = {
  naver: "네이버 AI검색",
  google: "구글 AI 모드",
};

function buildSteps(engines: ("naver" | "google")[]): (keyof typeof STAGE_LABEL)[] {
  const steps: (keyof typeof STAGE_LABEL)[] = ["install"];
  if (engines.includes("naver")) steps.push("naver");
  if (engines.includes("google")) steps.push("google");
  steps.push("save");
  return steps;
}

const CAUTION_NOTE = (
  <p className="border-t border-neutral-100 pt-3 text-[11px] text-amber-700">
    ⚠️ 구글 수집 중에는 시크릿 크롬 창이 실제로 열립니다. 수집이 끝날 때까지 그 창을 직접 닫지 말아주세요 — 자동으로 닫힙니다.
  </p>
);

export function CollectionProgressModal({
  open,
  keyword,
  engines,
  stage,
  log,
  error,
  onClose,
}: {
  open: boolean;
  keyword: string;
  engines: ("naver" | "google")[];
  stage: CollectionStage;
  log: string[];
  error: string | null;
  onClose: () => void;
}) {
  if (stage === "done") {
    return (
      <Modal open={open} onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CircleCheck size={40} className="text-emerald-500" />
          <h2 className="text-lg font-bold text-neutral-900">수집 완료</h2>
          <p className="text-sm text-neutral-500">
            &quot;{keyword}&quot; 키워드에 대해 {engines.map((e) => ENGINE_LABEL[e]).join(", ")} 수집과 저장까지 끝났습니다.
            <br />
            아래 목록에 새 결과가 반영되었습니다.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 h-10 rounded-md bg-slate-800 px-6 text-sm font-bold text-white cursor-pointer hover:opacity-90"
          >
            확인
          </button>
        </div>
      </Modal>
    );
  }

  if (stage === "error") {
    return (
      <Modal open={open} onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <TriangleAlert size={40} className="text-red-500" />
          <h2 className="text-lg font-bold text-neutral-900">수집 실패</h2>
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
          <div className="w-full">{CAUTION_NOTE}</div>
        </div>
      </Modal>
    );
  }

  const steps = buildSteps(engines);
  const currentIndex = steps.indexOf(stage as keyof typeof STAGE_LABEL);

  return (
    <Modal open={open} onClose={() => {}}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">&quot;{keyword}&quot; 수집 진행 중</h2>
          <p className="mt-1 text-xs text-neutral-500">완료될 때까지 이 창을 닫지 않아도 백그라운드에서 계속 진행됩니다.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          {steps.map((step, i) => {
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

        {CAUTION_NOTE}
      </div>
    </Modal>
  );
}
