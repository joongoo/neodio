"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";

const ALL_LABEL = "전체";

// Generic version of RangeDropdown for the rest of Overview's toolbar
// filters (플랫폼/카테고리/마켓/도메인) — same URL-query-as-state pattern,
// just parameterized over which key it writes and which "no filter" value
// clears it, instead of hardcoding the range enum.
export function FilterDropdown({
  label,
  paramKey,
  value,
  options,
  bold,
}: {
  label: string;
  paramKey: string;
  value: string;
  options: string[];
  bold?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ALL_LABEL) params.delete(paramKey);
    else params.set(paramKey, next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return <Dropdown label={label} value={value} options={options} onChange={handleChange} bold={bold} />;
}
