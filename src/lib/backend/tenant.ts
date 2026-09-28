import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getPromptStore } from "./database";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { ManagedBrand, Organization } from "@/lib/db/types";

// 요청마다 "지금 보고 있는 조직과 브랜드" — 헤더의 조직/브랜드 스위처
// (OrgBrandSwitcher)가 쿠키에 남긴 선택을 읽는다. 모든 페이지와 API가
// DEFAULT_ORG_ID/DEFAULT_BRAND_ID 대신 이것을 쓴다(조직별 데이터 분리).
//
// - 조직: selected-org 쿠키(조직 id). 없거나 사라진 조직이면 기본 조직.
// - 브랜드: selected-brand 쿠키(브랜드 이름, 스위처 표기와 같음). 그 조직의
//   활성 브랜드가 아니면 조직의 첫 활성 브랜드.
// - "Demo"는 목업 데이터 시연용 브랜드라 데이터 기준 브랜드가 되지 않는다 —
//   demo=true로 표시하고, brand는 조직의 첫 실제 브랜드로 둔다(GSC 등 브랜드
//   단위 조회가 예전처럼 자사 브랜드를 가리키도록).
export const ORG_COOKIE = "selected-org";
export const BRAND_COOKIE = "selected-brand";
const DEMO_BRAND_NAME = "Demo";

export interface Tenant {
  orgId: string;
  org: Organization;
  organizations: { id: string; name: string }[];
  /** 조직의 활성 브랜드 — 헤더 스위처 목록 */
  activeBrands: ManagedBrand[];
  /** 헤더에 선택된 브랜드 이름 */
  selectedBrandName: string;
  /** 데이터 기준 브랜드(자사 브랜드). 조직에 브랜드가 없으면 null */
  brand: ManagedBrand | null;
  /** brand?.id ?? "" — 브랜드 단위 조회 함수에 그대로 넘기기 위한 편의값 */
  brandId: string;
  demo: boolean;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// 요청 밖(테스트에서 라우트를 직접 부를 때 등)에는 쿠키가 없다 — 그때는 기본 조직.
// 단, 빌드 중 정적 렌더링을 시도할 때 cookies()가 던지는 Next.js 내부 에러는
// 삼키면 안 된다(그 페이지를 요청마다 렌더링으로 바꾸라는 신호 — 삼키면 기본
// 조직으로 고정된 정적 페이지가 된다). unstable_rethrow가 그것만 다시 던진다.
async function readCookie(name: string): Promise<string | undefined> {
  try {
    return (await cookies()).get(name)?.value;
  } catch (error) {
    unstable_rethrow(error);
    return undefined;
  }
}

export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  // 쿠키를 DB보다 먼저 읽는다 — 정적 렌더링 시도라면 여기서 멈추고 DB에 가지 않는다.
  const requestedOrg = await readCookie(ORG_COOKIE);
  const requestedBrand = await readCookie(BRAND_COOKIE);
  const store = await getPromptStore();
  const organizations = (await store.listOrganizations()).map(({ id, name }) => ({ id, name }));
  const orgId =
    organizations.find((o) => o.id === requestedOrg)?.id ??
    organizations.find((o) => o.id === DEFAULT_ORG_ID)?.id ??
    organizations[0]?.id ??
    DEFAULT_ORG_ID;

  const allBrands = await store.listBrands(orgId);
  const activeBrands = allBrands.filter((b) => b.status === "active");
  // 새 조직의 첫 브랜드는 "대기" 상태로 만들어진다 — 활성 브랜드가 없으면
  // 대기 브랜드라도 데이터 기준으로 삼아, 활성화 전에도 설정·수집을 시작할 수 있게.
  const realBrands = [...activeBrands, ...allBrands.filter((b) => b.status !== "active")].filter((b) => b.name !== DEMO_BRAND_NAME);
  const selected = activeBrands.find((b) => b.name === requestedBrand);
  const demo = selected?.name === DEMO_BRAND_NAME;
  const brand = selected && !demo ? selected : (realBrands[0] ?? null);
  const orgName = organizations.find((o) => o.id === orgId)?.name ?? orgId;

  return {
    orgId,
    org: { id: orgId, name: orgName, domain: brand ? hostnameOf(brand.url) : "" },
    organizations,
    activeBrands,
    selectedBrandName: selected?.name ?? brand?.name ?? "",
    brand,
    brandId: brand?.id ?? "",
    demo,
  };
});

/** 조직만 필요할 때 */
export async function getCurrentOrgId(): Promise<string> {
  return (await getCurrentTenant()).orgId;
}
