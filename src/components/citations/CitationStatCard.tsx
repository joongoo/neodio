import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

export function CitationStatCard({ label, value, sub, tooltip, highlight = false }: { label: string; value: string; sub: string; tooltip: string; highlight?: boolean }) {
  return <div className={cn("flex flex-col gap-2 rounded-xl border p-4", highlight ? "border-slate-800 bg-slate-800" : "border-neutral-200 bg-white")}>
    <span className={cn("flex items-center gap-1 text-xs font-medium", highlight ? "text-slate-300" : "text-neutral-500")}>{label}<Tooltip text={tooltip} /></span>
    <span className={cn("text-2xl font-bold tabular-nums", highlight ? "text-white" : "text-neutral-900")}>{value}</span>
    <span className={cn("text-xs", highlight ? "text-slate-300" : "text-neutral-500")}>{sub}</span>
  </div>;
}
