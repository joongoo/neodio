"use client";

import { useState } from "react";
import { ChevronRight, CircleCheck } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { ChecklistItem } from "@/lib/db";
import { cn } from "@/lib/cn";

// Matches Figma "Modal - Your AI Visibility Journey" / "Modal - Your
// Prompting Strategy" (646:11511 / 646:11557): clicking the summary card
// opens a step-by-step checklist modal.
export function ChecklistCard({ item }: { item: ChecklistItem }) {
  const [open, setOpen] = useState(false);
  const percent = (item.completedSteps / item.totalSteps) * 100;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-6 text-left transition-colors hover:bg-neutral-50 cursor-pointer"
      >
        <div>
          <b className="block text-sm font-semibold text-neutral-900">{item.title}</b>
          <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
          </div>
          <span className="mt-1.5 block text-xs text-neutral-500">
            {item.totalSteps}단계 중 {item.completedSteps}단계 완료
          </span>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-50 text-neutral-500">
          <ChevronRight size={16} />
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-xl font-bold text-black">{item.title}</h2>
          <ModalCloseButton onClose={() => setOpen(false)} />
        </div>
        <p className="mt-4 text-sm text-neutral-600">{item.description}</p>

        <div className="mt-4 flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium text-neutral-500">
            {item.completedSteps}/{item.totalSteps}
          </span>
        </div>

        <div className="mt-4 border-t border-neutral-200" />

        <div className="mt-2.5 flex flex-col gap-2.5">
          {item.steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3.5 py-3",
                !step.done && "bg-neutral-100"
              )}
            >
              {step.done ? (
                <CircleCheck size={20} className="shrink-0 text-emerald-600" />
              ) : (
                <span className="size-5 shrink-0 rounded-full border-[1.5px] border-neutral-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-black">{step.title}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{step.description}</p>
              </div>
              {!step.done && <ChevronRight size={14} className="shrink-0 text-neutral-400" />}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
