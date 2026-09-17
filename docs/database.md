# Prompt and collection database

The prompt catalog, taxonomy, tracking, strategy provenance, collection results,
and versioned analysis use SQLite at `.data/neodio.sqlite`. Set `NEODIO_DB_PATH`
to use another persistent file. Node >=22.13 is required for `node:sqlite`.
Use a persistent local disk and a Node server; this is not a shared multi-host
or ephemeral serverless database. The server-only entry point is
`src/lib/backend/database/index.ts`; do not import it into the client mock barrel.

## Model

```text
organizations
  categories -> topics -> prompts
  prompts -> prompt_sources
  prompts -> prompt_tracking -> tracking_events
  collection_jobs -> prompt_runs -> run_analyses
  run_analyses -> brand_observations / citations
```

- `prompts`: stable UUID, original text, normalized text, topic, search intent,
  creator/editor IDs, creation/update times. One normalized text per organization.
  Normalization is NFC + collapsed whitespace + lowercase; punctuation remains.
- `topics`: stable UUID, name, category ID. The same name in different categories
  is intentionally distinct. A topic can be uncategorized.
- `categories`: stable UUID, name, organization. Category is derived through the
  topic. `uncategorized_category_id` is permitted only when no topic is assigned,
  to support the existing category-first workflow.
- `prompt_sources`: multiple origins per prompt, generation purpose, reasoning,
  and original source metadata. `search_intent` answers the searcher's intention;
  generation purpose answers why the strategy proposed this question.
- `prompt_tracking`: organization + prompt + brand unique, active/paused/archived,
  first added time and actor. Untracked means no tracking record. Removing a
  library row archives tracking; it never deletes the prompt or collected runs.
  Reactivation preserves first-added metadata; transitions are in `tracking_events`.
- `prompt_runs`: stable collector ID, canonical prompt ID, exact question snapshot,
  platform, model, market, locale, response, status, error, job and optional retry ID.
  Separate attempts remain separate rows. Historical question text does not change
  when the catalog text is edited. Collector files are kept as raw ingestion artifacts.
- `run_analyses`: run + analysis version + input hash unique. The hash includes
  response, citations and brand configuration. Unchanged inputs reuse analysis;
  changed brand configuration produces another analysis record.
- `brand_observations`: one brand per analysis, observed brand configuration,
  mention presence/order, optional recommendation rank, sentiment and evidence.
  Mention order does not imply a recommendation rank, which is currently null.
- `citations`: deduplicated URL per analysis, domain, title, source order and brand.
- `collection_jobs`: persistent progress and outcome. Interrupted jobs are reported
  as failed when the owning process no longer exists; jobs do not resume automatically.

## Sentiment and metrics

The current analyzer is explicitly `keyword-heuristic-v1`, not an LLM sentiment
model. Persisted sentiment scores are -1..1: positive 0.56, neutral 0, negative
-0.5 (adapted from existing 0..1 heuristic outputs). Unmentioned brands have
NULL sentiment/score/position. Evidence is a nearby response excerpt; no confidence
or explicit recommendation rank is fabricated. The schema accepts `mixed`, but
the current classifier does not produce it.

Existing dashboard adapters retain their legacy 0..1 score contract so that this
storage migration does not silently change the visibility formula. SQL consumers
must use `brand_observations` for the new signed sentiment scale. Only successful
runs are analyzed. Average sentiment excludes NULLs. Distinguish COUNT(DISTINCT
prompt_id), COUNT(DISTINCT run_id), and citation URL counts when adding metrics.
Weekly visibility aggregation still runs on demand over cached analyses; there
is no materialized `metric_snapshots` table yet.

## Migration and operation

```sh
npm run db:migrate
npm run test:db
npm run dev
```

Initialization imports library seed rows, saved tracked rows and deletion flags,
strategy seeds, LLM bridge data, and real Naver/Google collector results. It runs
once transactionally for legacy catalog data. Each collector file is subsequently
checked by mtime/size and imported idempotently, preserving run IDs. `db:migrate`
also computes missing analyses and checks foreign keys. Re-running it does not
recreate archived tracking or duplicate executions/analyses. Legacy files are never
deleted or overwritten. Malformed import JSON stops migration with the filename.

Historical `lastModifiedAt` is the only available library timestamp and is used as
an import approximation, recorded as `timestampMeaning=legacy_last_modified` in
source metadata. Names such as "나" become actors of kind `legacy`, not verified
users. New unauthenticated writes use NULL actor IDs instead of inventing identities.
Authentication and mapping actors to real user accounts remain a separate task.

Back up the database with SQLite's backup API or with the app stopped; WAL mode
means copying only the main file while writes are active is not a valid backup.
Keep `.tmp` artifacts until the migration is accepted. Going back to legacy code
will not include new SQLite writes; do not treat legacy files as a current backup.

## API and compatibility

- `GET /api/prompts?q=...&status=all|untracked|active|paused|archived&limit=50&offset=0`
  lists the full catalog with provenance, IDs and tracking metadata.
- `POST /api/prompts` creates an untracked prompt. Body: `text`, optional `category`,
  `topic`, `searchIntent`, `sourceType`, `sourceKey`, `generationPurpose`,
  `generationReasoning`.
- `/api/tracked-topics` retains its existing add/edit/archive contract. PATCH also
  accepts `status`. Editing a text into an existing prompt returns 409.
- `/api/categories` supports GET/POST/PATCH/DELETE. Used categories cannot be
  deleted; renaming updates all derived prompt category labels.
- `/api/llm-bridge` saves strategy content and catalog provenance in one transaction.
  New brainstorm topics use `{prompt,category,topic}`; old strings are adapted on read.

Library pages temporarily partition imported `pl-*` rows and other tracked rows
for compatibility, but both partitions come from SQLite. The client-safe mock `db`
module still serves demo/research data. Brand configuration, GSC secrets, crawl
artifacts, diagnostic caches and opportunity targets retain their existing stores.
Current routes use the existing default organization/brand; multi-brand account
selection and authorization are not added by this migration.

## Verification

Store tests cover normalized deduplication, tenant constraints, tracking lifecycle,
taxonomy, transactional rollback, source/intent retention, question snapshots,
analysis reuse, and NULL sentiment. API tests use a temporary database, leaving
the application's data unchanged.
