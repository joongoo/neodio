import { getCurrentTenant } from "./tenant";

// "Demo" 브랜드가 선택돼 있으면(OrgBrandSwitcher.tsx) 모든 페이지가 실 수집
// 데이터를 건너뛰고 mock만 보여준다 — 수집 로그가 아직 없어도 완성된 화면을
// 시연할 수 있게 하기 위함. 판정은 tenant.ts가 한다: 현재 조직에 실제로
// "Demo" 브랜드가 있고 그것이 선택돼 있을 때만(다른 조직으로 옮기면서 남은
// 쿠키로 목업이 뜨지 않게).
export async function isDemoMode(): Promise<boolean> {
  return (await getCurrentTenant()).demo;
}
