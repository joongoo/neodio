"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { REQUEST_STATUS_LABEL, surfaceLabel } from "./RequestLogViews";

const statuses = ["reserved", "submitting", "submission_unknown", "queued", "collecting", "raw_saved", "normalized", "completed", "provider_failed", "artifact_failed", "projection_failed", "parse_failed", "cancelled"];
const surfaces = ["google-aio", "google-ai-mode", "naver-aio", "naver-ai", "gemini"];

export function RequestDetailFilters({ query, onChange }: { query: string; onChange: (changes: Record<string, string>) => void }) {
  const params = new URLSearchParams(query);
  const fields = [
    { key: "status", label: "상태", values: ["", ...statuses], labels: ["전체", ...statuses.map(status => REQUEST_STATUS_LABEL[status])] },
    { key: "surface", label: "플랫폼", values: ["", ...surfaces], labels: ["전체", ...surfaces.map(surfaceLabel)] },
    { key: "sort", label: "정렬", values: ["oldest", "newest"], labels: ["오래된순", "최신순"] },
  ];
  return <div className="flex flex-wrap items-end gap-3" aria-label="수집 항목 필터">{fields.map(field => {
    const value = params.get(field.key) || (field.key === "sort" ? "oldest" : "");
    return <div key={field.key} className="flex flex-col gap-1.5"><span className="text-xs text-neutral-500">{field.label}</span>
      <Dropdown variant="solid" label="" value={field.labels[field.values.indexOf(value)] ?? "전체"} options={field.labels}
        onChange={label => onChange({ [field.key]: field.values[field.labels.indexOf(label)] ?? "", page: "1" })} />
    </div>;
  })}</div>;
}
