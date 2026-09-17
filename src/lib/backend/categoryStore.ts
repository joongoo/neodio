import type { ManagedCategory } from "../db/types";
import { getPromptStore } from "./database";
import { normalize } from "./database/store";

export async function listCategories(orgId: string): Promise<ManagedCategory[]> {
  const store = await getPromptStore();
  const categories = store.sql.prepare(`SELECT c.id,c.name,'user' AS origin,
    (SELECT count(*) FROM prompts p LEFT JOIN topics t ON t.id=p.topic_id
      WHERE p.organization_id=c.organization_id AND coalesce(t.category_id,p.uncategorized_category_id)=c.id) AS promptCount
    FROM categories c WHERE c.organization_id=? ORDER BY c.name`).all(orgId).map(row => ({ ...row })) as unknown as ManagedCategory[];
  const topics = store.sql.prepare(`SELECT t.id,t.name,t.category_id,count(p.id) AS promptCount
    FROM topics t LEFT JOIN prompts p ON p.topic_id=t.id AND p.organization_id=t.organization_id
    WHERE t.organization_id=? AND t.category_id IS NOT NULL GROUP BY t.id ORDER BY t.name`).all(orgId);
  const topicsByCategory = new Map<string, NonNullable<ManagedCategory["topics"]>>();
  for (const topic of topics) {
    const categoryId = topic.category_id as string;
    const list = topicsByCategory.get(categoryId) ?? [];
    list.push({ id: topic.id as string, name: topic.name as string, promptCount: Number(topic.promptCount) });
    topicsByCategory.set(categoryId, list);
  }
  return categories.map(category => ({ ...category, topics: topicsByCategory.get(category.id) ?? [] }));
}

export async function saveCategory(orgId: string, name: string, categoryId?: string) {
  const store = await getPromptStore();
  return store.transaction(() => {
    if (!categoryId) return store.category(orgId, name);
    const existing = store.sql.prepare("SELECT id FROM categories WHERE organization_id=? AND id=?").get(orgId, categoryId);
    if (!existing) throw new Error("Category not found");
    const duplicate = store.sql.prepare("SELECT id FROM categories WHERE organization_id=? AND normalized_name=? AND id<>?").get(orgId, normalize(name), categoryId);
    if (duplicate) throw new Error("Category already exists");
    store.sql.prepare("UPDATE categories SET name=?,normalized_name=?,updated_at=? WHERE organization_id=? AND id=?")
      .run(name.trim(), normalize(name), new Date().toISOString(), orgId, categoryId);
    return categoryId;
  });
}

export async function deleteCategory(orgId: string, categoryId: string) {
  const store = await getPromptStore();
  return store.transaction(() => {
    const used = store.sql.prepare(`SELECT p.id FROM prompts p LEFT JOIN topics t ON t.id=p.topic_id
      WHERE p.organization_id=? AND coalesce(t.category_id,p.uncategorized_category_id)=? LIMIT 1`).get(orgId, categoryId);
    if (used) throw new Error("Category is in use");
    store.sql.prepare("DELETE FROM topics WHERE organization_id=? AND category_id=?").run(orgId, categoryId);
    return store.sql.prepare("DELETE FROM categories WHERE organization_id=? AND id=?").run(orgId, categoryId).changes > 0;
  });
}
