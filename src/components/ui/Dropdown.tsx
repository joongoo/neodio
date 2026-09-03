"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface DropdownProps {
  label: string;
  value: string;
  options?: string[];
  onChange?: (value: string) => void;
  bold?: boolean;
  className?: string;
  /** "light" (default) = neutral pill, used in page toolbars. "solid" =
   *  Figma's dark "WF Button + Drop-down" (node 5:530), used in table
   *  filter bars. */
  variant?: "light" | "solid";
}

export function Dropdown({
  label,
  value,
  options = [],
  onChange,
  bold,
  className,
  variant = "light",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className={cn("relative inline-block", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm whitespace-nowrap cursor-pointer transition-colors",
          variant === "solid"
            ? "bg-slate-800 text-white hover:opacity-90"
            : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
        )}
      >
        <span className={bold ? "font-semibold" : undefined}>
          {label ? `${label}: ${value}` : value}
        </span>
        <ChevronDown size={16} className={variant === "solid" ? "text-white" : "text-neutral-500"} />
      </button>
      {open && options.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-full rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange?.(opt);
                setOpen(false);
              }}
              className={cn(
                "block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-neutral-100 cursor-pointer",
                opt === value ? "font-medium text-neutral-900" : "text-neutral-700"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
