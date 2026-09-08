"use client";

import { useState } from "react";
import { Play } from "lucide-react";

// Matches Figma's green "안내 배너" pattern (Prompt Library node 646:12584,
// reused on Brand Presence/Prompt Strategy) — dismissible, session-only
// (no persisted "don't show again" — every doc flagged that policy as
// undecided, so default to the reversible option).
export function InfoBanner({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex w-full items-center gap-5 rounded-lg bg-emerald-50 px-5 py-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-bold text-neutral-900">{title}</p>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="배너 닫기"
            onClick={() => setDismissed(true)}
            className="text-base font-bold text-neutral-500 hover:text-neutral-700 cursor-pointer"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-xs text-emerald-900">{description}</p>
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="flex shrink-0 items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-90"
        >
          <Play size={12} fill="currentColor" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
