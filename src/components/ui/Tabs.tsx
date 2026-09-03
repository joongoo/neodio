"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  /** Shown as a small count pill next to the label ("badge" variant only). */
  badge?: number;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** "underline" = plain text tabs (Figma "Tab (Underline)"); "badge" =
   *  label + count pill (Figma "Tab (Badge)"). */
  variant?: "underline" | "badge";
  className?: string;
}

// Matches Figma "Tab (Underline)" / "Tab (Badge)" (node 646:11622 / 646:11693).
// Reuse this for any tabbed switcher instead of hand-rolling one per page.
export function Tabs({ items, value, onChange, variant = "underline", className }: TabsProps) {
  return (
    <div className={cn("flex items-start gap-6", className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="flex flex-col items-start gap-1.5 py-1.5 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px]">
              <span className={active ? "font-bold text-slate-800" : "font-medium text-slate-500"}>
                {item.label}
              </span>
              {variant === "badge" && item.badge !== undefined && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium",
                    active ? "bg-neutral-200 text-slate-800" : "bg-neutral-100 text-neutral-500"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </span>
            <span className={cn("h-0.5 w-full", active ? "bg-slate-800" : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}
