import type { AioKeywordGroup } from "./db/types";

// AIO 키워드(aio_keywords)와 프롬프트(prompts)를 잇는 규칙 — 서버와 이관 스크립트가 같이 쓴다. Node 모듈을 가져오지 않는다.

/** AIO 키워드의 기준 표기 — (브랜드, 이 값)이 유일하다. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

/** 기존 키워드 그룹 4종의 행방 — 비교/How-to는 검색 의도로, 브랜드/카테고리는 토픽으로 옮긴다. */
export const AIO_GROUP_TO_PROMPT: Record<AioKeywordGroup, { topic?: string; searchIntent?: string }> = {
  comparison: { searchIntent: "업체 비교" },
  howto: { searchIntent: "정보 탐색" },
  brand: { topic: "브랜드 키워드" },
  category: { topic: "카테고리 키워드" },
};

/** 프롬프트를 AIO 키워드로 만들 때의 그룹 — 위 매핑의 역방향(검색 의도/토픽), 모르면 category. */
export function aioGroupFor(searchIntent: string | null | undefined, topic: string | null | undefined): AioKeywordGroup {
  if (topic === AIO_GROUP_TO_PROMPT.brand.topic) return "brand";
  if (searchIntent === AIO_GROUP_TO_PROMPT.comparison.searchIntent) return "comparison";
  if (searchIntent === AIO_GROUP_TO_PROMPT.howto.searchIntent) return "howto";
  return "category";
}
