"use client";

import { ReactNode, useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

interface TooltipProps {
  text: string;
  children?: ReactNode;
  className?: string;
}

// Generic hover/focus tooltip. Pass `children` to wrap an existing trigger,
// or omit it to get the default (i) info icon used on the stat cards.
export function Tooltip({ text, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={id}
        className="grid size-3.5 cursor-default place-items-center rounded-full text-neutral-400 hover:text-neutral-600"
      >
        {children ?? <Info size={14} />}
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
      >
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </span>
    </span>
  );
}
