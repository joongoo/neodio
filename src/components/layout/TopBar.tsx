import { Bell, User } from "lucide-react";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { OrgBrandSwitcher } from "@/components/layout/OrgBrandSwitcher";
import { getSelectedBrandName } from "@/lib/backend/demoMode";
import { getManagedBrands } from "@/lib/backend/brandsManagementStore";

// Matches Figma "TopBar_ko" (node 646:28920, Korean page). Org/brand
// switcher restored per Adobe Brand Visibility reference — every page had
// its own "Brand: X" dropdown floating in its filter row, which put the org
// dropdown and the brand dropdown at two different levels depending on the
// page. Both now live here instead, so every page shares one org/brand
// context instead of each page inventing its own placement for it.
export async function TopBar() {
  const [organizations, realBrands] = await Promise.all([
    db.organizations.list(),
    getManagedBrands(DEFAULT_ORG_ID),
  ]);
  const activeBrandNames = realBrands.filter((b) => b.status === "active").map((b) => b.name);
  const selectedBrand = await getSelectedBrandName(activeBrandNames[0] ?? "");

  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-[#fbfbfb] px-6 py-3">
      <div className="grid size-8 shrink-0 place-items-center rounded bg-slate-800 text-sm font-bold text-white">
        N
      </div>
      <p className="text-base font-bold text-black">Neodio</p>
      <div className="mx-2 h-6 w-px bg-neutral-200" />
      <OrgBrandSwitcher
        organizations={organizations.map((o) => o.name)}
        brands={activeBrandNames}
        initialBrand={selectedBrand}
      />
      <div className="flex-1" />
      <button
        type="button"
        aria-label="알림"
        className="grid place-items-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
      >
        <Bell size={16} />
      </button>
      <button
        type="button"
        aria-label="프로필"
        className="grid place-items-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
      >
        <User size={16} />
      </button>
    </header>
  );
}
