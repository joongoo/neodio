"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEFAULT_ROLE_FILTER,
  DEFAULT_TIER_FILTER,
  ROLE_BUCKETS,
  ROLE_BUCKET_LABEL,
  TIER_BUCKETS,
  TIER_BUCKET_LABEL,
  type RoleBucket,
  type TierBucket,
} from "@/lib/brandRankFilter";

// "최신 상위 브랜드" 표의 역할 필터 — 체크박스 드롭다운. 자사·경쟁사가 기본으로 켜져 있고, 경쟁사를 켜면 등급(핵심·인접·…)을
// 세부 옵션으로 고른다. 파트너·구축사는 자사가 제품 회사이고 그 역할의 브랜드가 있을 때만 보인다.
export function BrandRoleFilter({
  roles,
  tiers,
  counts,
  showPartner,
  onChange,
}: {
  roles: ReadonlySet<RoleBucket>;
  tiers: ReadonlySet<TierBucket>;
  counts: { roles: Record<RoleBucket, number>; tiers: Record<TierBucket, number> };
  showPartner: boolean;
  onChange: (roles: Set<RoleBucket>, tiers: Set<TierBucket>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visibleRoles = ROLE_BUCKETS.filter((r) => r !== "partner" || showPartner || roles.has("partner"));
  const allTiersOn = TIER_BUCKETS.every((t) => tiers.has(t));
  const summary =
    visibleRoles
      .filter((r) => roles.has(r))
      .map((r) => (r === "competitor" && !allTiersOn ? `경쟁사 ${TIER_BUCKETS.filter((t) => tiers.has(t)).length}/${TIER_BUCKETS.length}` : ROLE_BUCKET_LABEL[r]))
      .join(", ") || "선택 없음";

  function toggleRole(role: RoleBucket) {
    const next = new Set(roles);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    onChange(next, new Set(tiers));
  }

  function toggleTier(tier: TierBucket) {
    const next = new Set(tiers);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    onChange(new Set(roles), next);
  }

  const isDefault =
    roles.size === DEFAULT_ROLE_FILTER.length &&
    DEFAULT_ROLE_FILTER.every((r) => roles.has(r)) &&
    tiers.size === DEFAULT_TIER_FILTER.length &&
    DEFAULT_TIER_FILTER.every((t) => tiers.has(t));

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-[420px] items-center gap-2 rounded-md bg-neutral-100 px-3.5 py-2 text-sm text-neutral-800 cursor-pointer hover:bg-neutral-200"
      >
        <span className="text-neutral-500">역할</span>
        <span className="truncate font-semibold">{summary}</span>
        <ChevronDown size={16} className="shrink-0 text-neutral-500" />
      </button>

      {open && (
        <div role="group" aria-label="역할 필터" className="absolute left-0 top-full z-20 mt-1 w-[280px] rounded-md border border-neutral-200 bg-white py-2 shadow-lg">
          {visibleRoles.map((role) => (
            <div key={role}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50">
                <input type="checkbox" checked={roles.has(role)} onChange={() => toggleRole(role)} />
                <span className="flex-1">{ROLE_BUCKET_LABEL[role]}</span>
                <span className="text-xs text-neutral-400">{counts.roles[role]}</span>
              </label>
              {role === "competitor" && roles.has("competitor") && (
                <div className="mb-1 ml-[34px] border-l border-neutral-200 pl-2">
                  {TIER_BUCKETS.map((tier) => (
                    <label key={tier} className={cn("flex cursor-pointer items-center gap-2 px-2 py-1 text-[13px] hover:bg-neutral-50", tiers.has(tier) ? "text-neutral-800" : "text-neutral-500")}>
                      <input type="checkbox" checked={tiers.has(tier)} onChange={() => toggleTier(tier)} />
                      <span className="flex-1">{TIER_BUCKET_LABEL[tier]}</span>
                      <span className="text-xs text-neutral-400">{counts.tiers[tier]}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-neutral-100 px-3.5 pt-2">
            <span className="text-[11px] text-neutral-400">제외한 브랜드는 항상 숨겨집니다</span>
            <button
              type="button"
              disabled={isDefault}
              onClick={() => onChange(new Set(DEFAULT_ROLE_FILTER), new Set(DEFAULT_TIER_FILTER))}
              className="text-xs font-medium text-slate-700 cursor-pointer hover:underline disabled:cursor-default disabled:text-neutral-300 disabled:no-underline"
            >
              기본값
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
