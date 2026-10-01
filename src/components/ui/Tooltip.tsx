"use client";

import { ReactNode, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 표 등 overflow가 있는 부모 안에서도 잘리지 않게 body에 고정 위치로 그린다.
  function show() {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect) {
      const half = 128;
      setPos({ left: Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8), top: rect.top });
    }
    setOpen(true);
  }

  return (
    <span
      ref={anchor}
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={id}
        className="grid size-3.5 cursor-default place-items-center rounded-full text-neutral-400 hover:text-neutral-600"
      >
        {children ?? <Info size={14} />}
      </button>
      {pos &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{ left: pos.left, top: pos.top - 8 }}
            className={cn(
              "pointer-events-none fixed z-[100] w-64 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg transition-opacity",
              open ? "opacity-100" : "opacity-0"
            )}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
