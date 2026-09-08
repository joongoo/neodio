"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";

// Adobe Brand Visibility 참고 — Organization(전역, 대행사/마스터 계정이
// 여러 조직을 오갈 때)과 Brand(그 조직 안의 특정 브랜드)를 필터 줄이 아니라
// 헤더에 계층으로 둔다. 모든 탭에서 같은 브랜드 컨텍스트를 유지해야 하니
// 페이지별 필터 줄이 아니라 여기 한 곳에 둬야 일관됨.
//
// 조직은 아직 1개뿐이라 선택 UI만 있고 실제로 아무 것도 안 바뀐다. 브랜드는
// "Demo" 선택 시 모든 페이지가 실 데이터 대신 mock으로 고정 렌더링되도록
// 쿠키(selected-brand)에 저장 — src/lib/backend/demoMode.ts가 서버 컴포넌트
// 에서 이 쿠키를 읽는다. "Neodigm"으로 돌아가면 실 데이터(있으면)가 다시
// 보인다.
const BRAND_COOKIE = "selected-brand";

export function OrgBrandSwitcher({
  organizations,
  brands,
  initialBrand,
}: {
  organizations: string[];
  brands: string[];
  initialBrand: string;
}) {
  const router = useRouter();
  const [org, setOrg] = useState(organizations[0] ?? "");
  const [brand, setBrand] = useState(initialBrand);

  function handleBrandChange(next: string) {
    setBrand(next);
    document.cookie = `${BRAND_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Dropdown label="조직" value={org} options={organizations} onChange={setOrg} />
      <Dropdown label="브랜드" value={brand} options={brands} onChange={handleBrandChange} />
    </div>
  );
}
