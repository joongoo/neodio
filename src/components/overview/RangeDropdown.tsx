"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { DateRange } from "@/lib/db";

const RANGE_LABELS: Record<DateRange, string> = {
  "1w": "최근 1주",
  "2w": "최근 2주",
  "4w": "최근 4주",
};

export function RangeDropdown({
  value,
  variant = "light",
  label = "",
}: {
  value: DateRange;
  variant?: "light" | "solid";
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(label: string) {
    const range = (Object.keys(RANGE_LABELS) as DateRange[]).find(
      (key) => RANGE_LABELS[key] === label
    );
    if (!range) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Dropdown
      label={label}
      value={RANGE_LABELS[value]}
      options={Object.values(RANGE_LABELS)}
      onChange={handleChange}
      variant={variant}
    />
  );
}
