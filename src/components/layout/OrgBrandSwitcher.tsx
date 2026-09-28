"use client";

import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";

// Adobe Brand Visibility 참고 — Organization(전역, 대행사/마스터 계정이
// 여러 조직을 오갈 때)과 Brand(그 조직 안의 특정 브랜드)를 필터 줄이 아니라
// 헤더에 계층으로 둔다. 모든 탭에서 같은 조직/브랜드 컨텍스트를 유지해야
// 하니 페이지별 필터 줄이 아니라 여기 한 곳에 둬야 일관됨.
//
// 선택은 쿠키에 저장하고 서버(src/lib/backend/tenant.ts)가 읽는다 — 조직을
// 바꾸면 그 조직의 브랜드·프롬프트·수집 데이터만 보인다. 조직을 바꿀 때는
// 이전 조직의 브랜드 선택을 지워 새 조직의 첫 브랜드로 시작한다. 브랜드는
// "Demo"를 고르면 모든 페이지가 실 데이터 대신 mock으로 고정 렌더링된다.
const ORG_COOKIE = "selected-org";
const BRAND_COOKIE = "selected-brand";
const ONE_YEAR = 31536000;

export function OrgBrandSwitcher({
  organizations,
  selectedOrgId,
  brands,
  selectedBrand,
}: {
  organizations: { id: string; name: string }[];
  selectedOrgId: string;
  brands: string[];
  selectedBrand: string;
}) {
  const router = useRouter();
  const selectedOrgName = organizations.find((o) => o.id === selectedOrgId)?.name ?? "";

  function handleOrgChange(name: string) {
    const org = organizations.find((o) => o.name === name);
    if (!org || org.id === selectedOrgId) return;
    document.cookie = `${ORG_COOKIE}=${encodeURIComponent(org.id)}; path=/; max-age=${ONE_YEAR}`;
    document.cookie = `${BRAND_COOKIE}=; path=/; max-age=0`;
    // 브랜드 상세처럼 이전 조직의 항목을 보던 화면이면 목록으로 돌아간다.
    if (/^\/(brands-management|youtube-aio)\/./.test(window.location.pathname)) {
      router.push(`/${window.location.pathname.split("/")[1]}`);
    }
    router.refresh();
  }

  function handleBrandChange(next: string) {
    document.cookie = `${BRAND_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${ONE_YEAR}`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Dropdown label="조직" value={selectedOrgName} options={organizations.map((o) => o.name)} onChange={handleOrgChange} />
      <Dropdown
        label="브랜드"
        value={selectedBrand || "브랜드 없음"}
        options={brands.length > 0 ? brands : ["브랜드 없음"]}
        onChange={(next) => next !== "브랜드 없음" && handleBrandChange(next)}
      />
    </div>
  );
}
