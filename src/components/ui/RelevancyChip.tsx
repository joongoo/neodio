import { cn } from "@/lib/cn";
import { Relevancy } from "@/lib/db";

// Matches Figma "Relevancy Chip" (node 646:12102 etc., Prompt Research
// results). Figma's wireframe only shows the neutral "낮음" variant — the
// other three tiers are colored here so the four levels stay visually
// distinguishable at a glance.
const RELEVANCY_CLASSES: Record<Relevancy, string> = {
  낮음: "bg-neutral-200 text-neutral-600",
  중간: "bg-amber-100 text-amber-700",
  높음: "bg-emerald-100 text-emerald-700",
  Best: "bg-slate-800 text-white",
};

export function RelevancyChip({ value }: { value: Relevancy }) {
  return (
    <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", RELEVANCY_CLASSES[value])}>
      {value}
    </span>
  );
}
