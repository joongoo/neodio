// 수집 질의가 "자사 브랜드명이 들어간 질의"인지 가르는 순수 함수.
// 브랜드 질의("네오다임 마케팅 자동화")는 자사가 언급되기 쉬워 가시성을 부풀리고,
// 일반 질의("마케팅 자동화 솔루션 추천")의 가시성이 실제 신규 노출을 보여준다 —
// 둘을 섞은 평균은 프롬프트 구성에 따라 달라지므로 나눠서 볼 수 있어야 한다.

export type QueryScope = "brand" | "nonbrand";

const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[\s\-_.·,'"“”‘’()[\]]+/g, "");

/** 브랜드 이름·별칭·도메인(서브도메인/TLD 제외)을 질의 매칭용 키워드로 정리. */
export function brandQueryKeywords(brand: { name: string; domain?: string; aliases?: string[] }): string[] {
  const keys = new Set<string>();
  const add = (value?: string) => {
    const key = normalize(value ?? "");
    if (key.length >= 2) keys.add(key);
  };
  add(brand.name);
  for (const alias of brand.aliases ?? []) add(alias);
  const host = (brand.domain ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const label = host.split(".").filter(Boolean).slice(0, -1).pop();
  if (label && label.length >= 3) add(label);
  return [...keys];
}

export function isBrandQuery(query: string, keywords: string[]): boolean {
  const q = normalize(query);
  return keywords.some((keyword) => q.includes(keyword));
}

/** 질의가 없으면 판단 불가(null) — 범위를 좁힌 화면에서는 어느 쪽에도 넣지 않는다. */
export function queryScopeOf(query: string | undefined, keywords: string[]): QueryScope | null {
  const text = query?.trim();
  if (!text) return null;
  return isBrandQuery(text, keywords) ? "brand" : "nonbrand";
}
