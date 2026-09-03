import { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface ChartPanelProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}

// Shared header (title + description + "자세히 보기" button) for every
// chart/list card on the Overview page, with consistent spacing before
// the chart itself so the description never crowds it. The action button
// matches Figma's "WF Button" (node 646:28300).
export function ChartPanel({
  title,
  description,
  actionLabel,
  onAction,
  children,
}: ChartPanelProps) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        {actionLabel && (
          <Button
            variant="detail"
            size="sm"
            icon={<BarChart3 size={16} />}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
