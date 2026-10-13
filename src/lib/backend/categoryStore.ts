import type { ManagedCategory } from "../db/types";
import { randomUUID } from "node:crypto";
import { getPromptStore } from "./database";
import { normalize } from "./database/store";

export async function listCategories(orgId: string, brandId?: string): Promise<ManagedCategory[]> {
  const store = await getPromptStore();
  const categories = await store.query<{ id: string; name: string; origin: string; promptcount: number }>(`SELECT c.id,c.name,'user' AS origin,
    (SELECT count(*) FROM prompts p JOIN prompt_tracking tr ON tr.prompt_id=p.id AND tr.organization_id=p.organization_id
      LEFT JOIN topics t ON t.id=p.topic_id
      WHERE p.organization_id=c.organization_id AND coalesce(t.category_id,p.uncategorized_category_id)=c.id
      AND tr.status='active' AND ($2::text IS NULL OR tr.brand_id=$2)) AS "promptCount"
    FROM categories c WHERE c.organization_id=$1 ORDER BY c.name`, [orgId, brandId ?? null]) as unknown as ManagedCategory[];
  const topics = await store.query<{ id: string; name: string; category_id: string; promptCount: number }>(`SELECT t.id,t.name,t.category_id,count(tr.id) AS "promptCount"
    FROM topics t LEFT JOIN prompts p ON p.topic_id=t.id AND p.organization_id=t.organization_id
    LEFT JOIN prompt_tracking tr ON tr.prompt_id=p.id AND tr.organization_id=p.organization_id
      AND tr.status='active' AND ($2::text IS NULL OR tr.brand_id=$2)
    WHERE t.organization_id=$1 AND t.category_id IS NOT NULL GROUP BY t.id ORDER BY t.name`, [orgId, brandId ?? null]);
  const topicsByCategory = new Map<string, NonNullable<ManagedCategory["topics"]>>();
  for (const topic of topics) {
    const categoryId = topic.category_id;
    const list = topicsByCategory.get(categoryId) ?? [];
    list.push({ id: topic.id, name: topic.name, promptCount: Number(topic.promptCount) });
    topicsByCategory.set(categoryId, list);
  }
  return categories.map(category => ({ ...category, topics: topicsByCategory.get(category.id) ?? [] }));
}

export async function renameCategories(orgId: string, changes: { id: string; name: string }[]) {
  const store = await getPromptStore();
  return store.transaction(async () => {
    const current = await store.query<{ id: string; normalized_name: string }>(
      "SELECT id,normalized_name FROM categories WHERE organization_id=$1 FOR UPDATE", [orgId]);
    const ids = new Set(current.map(category => category.id));
    const names = new Map(current.map(category => [category.id, category.normalized_name]));
    if (!changes.length || new Set(changes.map(change => change.id)).size !== changes.length ||
      changes.some(change => !ids.has(change.id) || !normalize(change.name))) throw new Error("Invalid categories");
    for (const change of changes) names.set(change.id, normalize(change.name));
    if (new Set(names.values()).size !== names.size) throw new Error("Category already exists");
    // Temporary unique names allow two existing categories to exchange names in one transaction.
    for (const change of changes) await store.query(
      "UPDATE categories SET normalized_name=$1 WHERE organization_id=$2 AND id=$3",
      [`__bulk_${randomUUID()}__`, orgId, change.id]);
    for (const change of changes) await store.query(
      "UPDATE categories SET name=$1,normalized_name=$2,updated_at=$3 WHERE organization_id=$4 AND id=$5",
      [change.name.trim(), normalize(change.name), new Date().toISOString(), orgId, change.id]);
  });
}

export async function saveCategory(orgId: string, name: string, categoryId?: string) {
  const store = await getPromptStore();
  return store.transaction(async () => {
    if (!categoryId) return store.category(orgId, name);
    const [existing] = await store.query("SELECT id FROM categories WHERE organization_id=$1 AND id=$2", [orgId, categoryId]);
    if (!existing) throw new Error("Category not found");
    const [duplicate] = await store.query("SELECT id FROM categories WHERE organization_id=$1 AND normalized_name=$2 AND id<>$3", [orgId, normalize(name), categoryId]);
    if (duplicate) throw new Error("Category already exists");
    await store.query("UPDATE categories SET name=$1,normalized_name=$2,updated_at=$3 WHERE organization_id=$4 AND id=$5",
      [name.trim(), normalize(name), new Date().toISOString(), orgId, categoryId]);
    return categoryId;
  });
}

export async function deleteCategory(orgId: string, categoryId: string) {
  const store = await getPromptStore();
  return store.transaction(async () => {
    const [used] = await store.query(`SELECT p.id FROM prompts p LEFT JOIN topics t ON t.id=p.topic_id
      WHERE p.organization_id=$1 AND coalesce(t.category_id,p.uncategorized_category_id)=$2 LIMIT 1`, [orgId, categoryId]);
    if (used) throw new Error("Category is in use");
    await store.query("DELETE FROM topics WHERE organization_id=$1 AND category_id=$2", [orgId, categoryId]);
    return (await store.query("DELETE FROM categories WHERE organization_id=$1 AND id=$2 RETURNING id", [orgId, categoryId])).length > 0;
  });
}
