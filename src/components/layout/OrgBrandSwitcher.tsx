"use client";

import { usePathname, useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";

// Adobe Brand Visibility 참고 — Organization(전역, 대행사/마스터 계정이
// 여러 조직을 오갈 때)과 Brand(그 조직 안의 특정 브랜드)를 필터 줄이 아니라
// 헤더에 계층으로 둔다. 모든 탭에서 같은 조직/브랜드 컨텍스트를 유지해야
// 하니 페이지별 필터 줄이 아니라 여기 한 곳에 둬야 일관됨.
//
// 조직·브랜드는 URL이 기준이다(/{조직}/{브랜드}/{화면}) — 여기서 고르면 주소가
// 바뀐다. 브랜드를 바꾸면 같은 화면에 머물고(목록 화면으로), 조직을 바꾸면 그
// 조직의 첫 브랜드로 간다. 브랜드 "Demo"는 모든 페이지를 목업으로 그린다.
export function OrgBrandSwitcher({
  organizations,
  orgSlug,
  brands,
  brandSlug,
}: {
  organizations: { name: string; slug: string }[];
  orgSlug: string;
  brands: { name: string; slug: string }[];
  brandSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedOrgName = organizations.find((o) => o.slug === orgSlug)?.name ?? "";
  const selectedBrandName = brands.find((b) => b.slug === brandSlug)?.name ?? "";

  // 지금 화면 — /{조직}/{브랜드}/{화면}/… 에서 첫 단계만(상세 화면의 id는 다른 브랜드엔 없다).
  // 조직 무관 화면(/help 등)에서는 개요로.
  function currentSection(): string {
    const [first, , section] = pathname.split("/").filter(Boolean);
    if (first !== orgSlug || !section) return "";
    return `/${section}`;
  }

  function handleOrgChange(name: string) {
    const org = organizations.find((o) => o.name === name);
    if (!org || org.slug === orgSlug) return;
    router.push(`/${encodeURIComponent(org.slug)}`);
  }

  function handleBrandChange(name: string) {
    const brand = brands.find((b) => b.name === name);
    if (!brand || brand.slug === brandSlug) return;
    router.push(`/${encodeURIComponent(orgSlug)}/${encodeURIComponent(brand.slug)}${currentSection()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Dropdown label="조직" value={selectedOrgName} options={organizations.map((o) => o.name)} onChange={handleOrgChange} />
      <Dropdown
        label="브랜드"
        value={selectedBrandName || "브랜드 없음"}
        options={brands.length > 0 ? brands.map((b) => b.name) : ["브랜드 없음"]}
        onChange={handleBrandChange}
      />
    </div>
  );
}
