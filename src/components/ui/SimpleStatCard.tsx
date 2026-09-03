import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";

// A plain number stat card (label + value, no trend/sparkline) — Figma's
// "Stat Card" as used on Prompt Research and URL Inspector, where the
// number has no week-over-week comparison. For cards that DO have a trend
// and sparkline, use `overview/StatCard` instead.
export function SimpleStatCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number | string;
  tooltip?: string;
}) {
  return (
    <Card className="flex flex-col justify-between gap-6 p-4">
      <span className="flex max-w-[200px] items-start gap-2 text-xs font-medium text-neutral-500">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </span>
      <span className="text-2xl font-bold tabular-nums text-neutral-900">
        {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
      </span>
    </Card>
  );
}
