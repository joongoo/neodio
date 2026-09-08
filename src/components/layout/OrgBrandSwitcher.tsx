"use client";

import { useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";

// Adobe Brand Visibility 참고 — Organization(전역, 대행사/마스터 계정이
// 여러 조직을 오갈 때)과 Brand(그 조직 안의 특정 브랜드)를 필터 줄이 아니라
// 헤더에 계층으로 둔다. 모든 탭에서 같은 브랜드 컨텍스트를 유지해야 하니
// 페이지별 필터 줄이 아니라 여기 한 곳에 둬야 일관됨.
//
// 지금은 조직 1개("Neodigm")·활성 브랜드 1개뿐이라 선택해도 실제로 어떤
// 페이지의 데이터가 바뀌진 않는다 — 매 페이지가 여전히 DEFAULT_ORG_ID/
// brand-neodigm을 그대로 쓴다. 조직/브랜드가 실제로 여러 개가 되면, 이
// 선택값을 쿠키 등으로 페이지들이 읽어 org/brand를 바꾸는 작업이 이어서
// 필요하다.
export function OrgBrandSwitcher({
  organizations,
  brands,
}: {
  organizations: string[];
  brands: string[];
}) {
  const [org, setOrg] = useState(organizations[0] ?? "");
  const [brand, setBrand] = useState(brands[0] ?? "");

  return (
    <div className="flex items-center gap-2">
      <Dropdown label="조직" value={org} options={organizations} onChange={setOrg} />
      <Dropdown label="브랜드" value={brand} options={brands} onChange={setBrand} />
    </div>
  );
}
