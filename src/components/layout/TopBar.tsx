import { Bell, User } from "lucide-react";
import { OrgBrandSwitcher } from "@/components/layout/OrgBrandSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { isStaff, roleLabel } from "@/lib/auth/permissions";

// Matches Figma "TopBar_ko" (node 646:28920, Korean page). Org/brand
// switcher restored per Adobe Brand Visibility reference — every page had
// its own "Brand: X" dropdown floating in its filter row, which put the org
// dropdown and the brand dropdown at two different levels depending on the
// page. Both now live here instead, so every page shares one org/brand
// context instead of each page inventing its own placement for it.
export async function TopBar() {
  const tenant = await getCurrentTenant();
  const user = tenant.principal ? await getCurrentUser() : null;
  const membership = tenant.principal?.memberships.find((m) => m.organizationId === tenant.orgId);
  const role = !tenant.principal ? "" : isStaff(tenant.principal) ? "네오다임 직원" : membership ? roleLabel(membership) : "";
  // 활성 브랜드 + (대기 중인) 지금 보고 있는 브랜드 — 주소로 연 대기 브랜드도 스위처에 보이게.
  const switcherBrands = tenant.activeBrands.some((b) => b.slug === tenant.brandSlug) || !tenant.brand
    ? tenant.activeBrands
    : [...tenant.activeBrands, { name: tenant.brand.name, slug: tenant.brandSlug }];

  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-[#fbfbfb] px-6 py-3">
      <div className="grid size-8 shrink-0 place-items-center rounded bg-slate-800 text-sm font-bold text-white">
        N
      </div>
      <p className="text-base font-bold text-black">Neodio</p>
      <div className="mx-2 h-6 w-px bg-neutral-200" />
      <OrgBrandSwitcher
        organizations={tenant.organizations}
        orgSlug={tenant.orgSlug}
        brands={switcherBrands}
        brandSlug={tenant.brandSlug}
      />
      <div className="flex-1" />
      <button
        type="button"
        aria-label="알림"
        className="grid place-items-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
      >
        <Bell size={16} />
      </button>
      {user ? (
        <UserMenu name={user.name} email={user.email} roleLabel={role} />
      ) : (
        <button
          type="button"
          aria-label="프로필"
          className="grid place-items-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
        >
          <User size={16} />
        </button>
      )}
    </header>
  );
}
