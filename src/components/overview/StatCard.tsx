import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { Sparkline } from "@/components/charts/Sparkline";
import { StatCard as StatCardData } from "@/lib/db";
import { cn } from "@/lib/cn";

// Reused across every dashboard page — build new pages against this
// instead of re-authoring a stat card each time.
export function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <span className="flex items-center gap-1 text-xs font-medium text-neutral-500">
        {stat.label}
        <Tooltip text={stat.description} />
      </span>
      <span className="text-2xl font-bold tabular-nums text-neutral-900">
        {stat.decimals ? stat.value.toFixed(stat.decimals) : stat.value.toLocaleString("ko-KR")}
      </span>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-medium",
            stat.trend.direction === "up" && "text-emerald-600",
            stat.trend.direction === "down" && "text-red-600",
            stat.trend.direction === "flat" && "text-neutral-400"
          )}
        >
          {stat.trend.direction === "up" && "▲ "}
          {stat.trend.direction === "down" && "▼ "}
          지난주 대비 {stat.trend.percent}%
        </span>
        <Sparkline data={stat.sparkline} />
      </div>
    </Card>
  );
}
