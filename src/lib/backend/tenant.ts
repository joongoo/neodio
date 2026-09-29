import { hostnameOfUrl } from "@/lib/normalizeUrl";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { getPromptStore } from "./database";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { ManagedBrand, Organization } from "@/lib/db/types";
import { assignBrandSlugs, NO_BRAND_SLUG } from "@/lib/slug";
import { TENANT_COOKIE, TENANT_HEADERS, TenantRef, tenantFromCookie } from "@/lib/tenantRouting";

// 요청마다 "지금 보고 있는 조직과 브랜드". URL이 기준이다 — /{조직}/{브랜드}/{화면}
// (src/lib/tenantRouting.ts). 프록시(src/proxy.ts)가 주소에서 해석해 요청 헤더로
// 넘긴 것을 읽는다:
// - 화면(source=path): 주소에 적힌 조직·브랜드가 없으면 404 — 남의 조직으로 조용히
//   바뀌지 않게.
// - API(source=referer/cookie): 호출한 화면의 조직·브랜드. 못 찾으면 기본 조직.
// - 조직 무관 화면(/help 등)·요청 밖(테스트, 스크립트): 마지막 위치 쿠키, 없으면 기본 조직.
// "Demo"(목업 시연 브랜드)는 데이터 기준 브랜드가 되지 않는다 — demo=true로 표시하고
// brand는 조직의 첫 실제 브랜드로 둔다(GSC 등 브랜드 단위 조회가 자사 브랜드를 가리키도록).
const DEMO_BRAND_NAME = "Demo";

export interface TenantBrand extends ManagedBrand {
  slug: string;
}

export interface Tenant {
  orgId: string;
  orgSlug: string;
  org: Organization;
  organizations: { id: string; name: string; slug: string }[];
  /** 조직의 활성 브랜드 — 헤더 스위처 목록 */
  activeBrands: TenantBrand[];
  /** URL의 브랜드 자리(선택된 브랜드, Demo 포함). 브랜드가 없는 조직은 "-" */
  brandSlug: string;
  /** 헤더에 선택된 브랜드 이름 */
  selectedBrandName: string;
  /** 이 조직·브랜드 화면의 URL 앞부분: /{조직}/{브랜드} */
  base: string;
  /** 데이터 기준 브랜드(자사 브랜드). 조직에 브랜드가 없으면 null */
  brand: ManagedBrand | null;
  /** brand?.id ?? "" — 브랜드 단위 조회 함수에 그대로 넘기기 위한 편의값 */
  brandId: string;
  demo: boolean;
}

// 요청 밖(테스트에서 라우트를 직접 부를 때 등)에는 헤더·쿠키가 없다 — 그때는 기본 조직.
// 단, 빌드 중 정적 렌더링을 시도할 때 Next.js가 던지는 내부 에러는 삼키면 안 된다
// (그 페이지를 요청마다 렌더링으로 바꾸라는 신호). unstable_rethrow가 그것만 다시 던진다.
async function readRequest(): Promise<{ ref: TenantRef | null; strict: boolean }> {
  try {
    const h = await headers();
    const org = h.get(TENANT_HEADERS.org);
    if (org) return { ref: { org, brand: h.get(TENANT_HEADERS.brand) }, strict: h.get(TENANT_HEADERS.source) === "path" };
    return { ref: tenantFromCookie((await cookies()).get(TENANT_COOKIE)?.value), strict: false };
  } catch (error) {
    unstable_rethrow(error);
    return { ref: null, strict: false };
  }
}

function hostnameOf(url: string): string {
  return (hostnameOfUrl(url) ?? "").replace(/^www\./, "");
}

export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  // 요청 정보를 DB보다 먼저 읽는다 — 정적 렌더링 시도라면 여기서 멈추고 DB에 가지 않는다.
  const { ref, strict } = await readRequest();
  const store = await getPromptStore();
  const organizations = (await store.listOrganizations()).map(({ id, name, slug }) => ({ id, name, slug }));

  let org = ref ? organizations.find((o) => o.slug === ref.org) : undefined;
  if (!org && strict) notFound();
  org ??= organizations.find((o) => o.id === DEFAULT_ORG_ID) ?? organizations[0];
  const orgId = org?.id ?? DEFAULT_ORG_ID;
  const orgSlug = org?.slug ?? DEFAULT_ORG_ID;

  const allBrands = await store.listBrands(orgId);
  const slugs = assignBrandSlugs(allBrands);
  const withSlug = (b: ManagedBrand): TenantBrand => ({ ...b, slug: slugs.get(b.id)! });
  const activeBrands = allBrands.filter((b) => b.status === "active").map(withSlug);
  // 새 조직의 첫 브랜드는 "대기" 상태로 만들어진다 — 활성 브랜드가 없으면
  // 대기 브랜드라도 데이터 기준으로 삼아, 활성화 전에도 설정·수집을 시작할 수 있게.
  const realBrands = [...activeBrands, ...allBrands.filter((b) => b.status !== "active").map(withSlug)].filter(
    (b) => b.name !== DEMO_BRAND_NAME
  );

  // 주소가 이 조직의 브랜드를 가리키면 그 브랜드, 아니면(브랜드 자리가 "-" 등) 기본 브랜드.
  const wantsBrand = ref && ref.org === orgSlug && ref.brand && ref.brand !== NO_BRAND_SLUG ? ref.brand : null;
  const selected = wantsBrand ? allBrands.map(withSlug).find((b) => b.slug === wantsBrand) : undefined;
  if (wantsBrand && !selected && strict) notFound();
  const demo = selected?.name === DEMO_BRAND_NAME;
  const brand = selected && !demo ? selected : (realBrands[0] ?? null);
  const brandSlug = selected?.slug ?? (brand ? slugs.get(brand.id)! : NO_BRAND_SLUG);

  return {
    orgId,
    orgSlug,
    org: { id: orgId, name: org?.name ?? orgId, domain: brand ? hostnameOf(brand.url) : "" },
    organizations,
    activeBrands,
    brandSlug,
    selectedBrandName: selected?.name ?? brand?.name ?? "",
    base: `/${encodeURIComponent(orgSlug)}/${encodeURIComponent(brandSlug)}`,
    brand,
    brandId: brand?.id ?? "",
    demo,
  };
});

/** 조직만 필요할 때 */
export async function getCurrentOrgId(): Promise<string> {
  return (await getCurrentTenant()).orgId;
}
