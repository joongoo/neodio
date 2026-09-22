// One-off merge: copies everything the local Postgres has beyond what the
// git-committed legacy seed files produced (topic cleanup, reclassification,
// new prompts added via the local dev UI) into whatever POSTGRES_URL points
// at when this runs — matched by name/normalized text, not by row id, since
// the two databases assign different ids to the "same" category/topic.
// Usage: SOURCE_POSTGRES_URL=<local> POSTGRES_URL=<neon> npx tsx scripts/sync-local-to-remote.ts
import { Pool } from "pg";
import { getPromptStore } from "../src/lib/backend/database";

const ORG_ID = "neodigm";

async function main() {
  const sourceUrl = process.env.SOURCE_POSTGRES_URL;
  if (!sourceUrl) throw new Error("SOURCE_POSTGRES_URL is required (the local Postgres to copy FROM)");
  const source = new Pool({ connectionString: sourceUrl });
  const store = await getPromptStore();

  const prompts = (await source.query(`
    SELECT p.id,p.text,p.search_intent,c.name AS category,t.name AS topic
    FROM prompts p
    LEFT JOIN topics t ON t.id=p.topic_id
    LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
    WHERE p.organization_id=$1
  `, [ORG_ID])).rows;

  const sources = (await source.query(`SELECT * FROM prompt_sources WHERE prompt_id=ANY($1)`, [prompts.map((p) => p.id)])).rows;
  const sourcesByPrompt = new Map<string, typeof sources>();
  for (const s of sources) sourcesByPrompt.set(s.prompt_id, [...(sourcesByPrompt.get(s.prompt_id) ?? []), s]);

  const tracking = (await source.query(`SELECT * FROM prompt_tracking WHERE organization_id=$1 AND prompt_id=ANY($2)`, [ORG_ID, prompts.map((p) => p.id)])).rows;
  const trackingByPrompt = new Map(tracking.map((t) => [t.prompt_id, t]));

  let created = 0;
  for (const p of prompts) {
    const promptSources = sourcesByPrompt.get(p.id) ?? [];
    const primarySource = promptSources[0];
    const promptId = await store.upsertPrompt(ORG_ID, {
      text: p.text,
      category: p.category ?? undefined,
      topic: p.topic ?? undefined,
      searchIntent: p.search_intent ?? undefined,
      sourceType: primarySource?.source_type,
      sourceKey: primarySource?.source_key,
      generationPurpose: primarySource?.generation_purpose ?? undefined,
      generationReasoning: primarySource?.generation_reasoning ?? undefined,
      metadata: primarySource?.metadata_json,
    }, true);
    created++;

    const track = trackingByPrompt.get(p.id);
    if (track) {
      const row = await store.track(ORG_ID, { text: p.text, category: p.category ?? undefined, topic: p.topic ?? undefined },
        { brandId: track.brand_id, origin: track.origin, addedAt: track.added_at });
      if (track.status !== "active") await store.setTrackingStatus(ORG_ID, row.id, track.status);
    }
  }

  console.log(`Merged ${created} prompts (with categories/topics/tracking) from local into remote.`);
  await source.end();
  await store.close();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
