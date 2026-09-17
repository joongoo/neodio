import { getPromptStore } from "./database";
import { PromptTopicGroup } from "@/lib/db/types";
import { listCategories } from "./categoryStore";

// 토픽의 단일 DB. 프롬프트 라이브러리(추적/수동 추가/CSV/편집)와 가시성
// 개요의 "AI로 토픽 묶기"가 전부 SQLite의 prompts/topics/categories 테이블
// 하나로 모인다 — types.ts의 PromptTopicGroup 정의 참고.

export async function getPromptTopicGroups(orgId: string): Promise<PromptTopicGroup[]> {
  return (await getPromptStore()).groups(orgId);
}

// 카테고리별 토픽 드롭다운 옵션 — "새 토픽" 자유 입력이 아니면 항상 여기서
// 고르게 해서 같은 주제가 다른 이름으로 쪼개지는 걸 막는다. 카테고리가 아직
// 없는 토픽(AI 벌크 그룹핑 결과)은 uncategorized에 모은다.
export async function getTopicOptionsByCategory(
  orgId: string
): Promise<{ byCategory: Record<string, string[]>; uncategorized: string[] }> {
  const groups = await getPromptTopicGroups(orgId);
  const byCategory: Record<string, string[]> = Object.fromEntries((await listCategories(orgId)).map(category => [category.name, []]));
  const uncategorizedSet = new Set<string>();
  for (const group of groups) {
    if (group.category) {
      const list = byCategory[group.category] ?? [];
      if (!list.includes(group.topic)) list.push(group.topic);
      byCategory[group.category] = list;
    } else {
      uncategorizedSet.add(group.topic);
    }
  }
  for (const key of Object.keys(byCategory)) byCategory[key].sort((a, b) => a.localeCompare(b, "ko"));
  return { byCategory, uncategorized: [...uncategorizedSet].sort((a, b) => a.localeCompare(b, "ko")) };
}
