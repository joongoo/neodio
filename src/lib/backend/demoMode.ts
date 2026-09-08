import { cookies } from "next/headers";

const BRAND_COOKIE = "selected-brand";
const DEMO_BRAND_NAME = "Demo";

// "Demo" 브랜드가 선택돼 있으면(OrgBrandSwitcher.tsx) 모든 페이지가 실 수집
// 데이터를 건너뛰고 mock만 보여준다 — 수집 로그가 아직 없어도 완성된 화면을
// 시연할 수 있게 하기 위함. Neodigm(기본값)은 계속 실 데이터를 우선한다.
export async function isDemoMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(BRAND_COOKIE)?.value === DEMO_BRAND_NAME;
}

export async function getSelectedBrandName(defaultName: string): Promise<string> {
  const store = await cookies();
  return store.get(BRAND_COOKIE)?.value ?? defaultName;
}
