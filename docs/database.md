# Prompt and collection database

The prompt catalog, taxonomy, tracking, strategy provenance, collection results,
and versioned analysis use **Postgres** (Vercel Postgres in production; any
standard Postgres works locally). Set `POSTGRES_URL` (and, if your provider
gives you both a pooled and a direct connection string, `POSTGRES_URL_NON_POOLING`
— the store prefers the non-pooling one, since it holds a session per
transaction) to a reachable Postgres instance. There is no on-disk fallback:
`getPromptStore()` throws immediately if neither is set. The server-only entry
point is `src/lib/backend/database/index.ts`; do not import it into the client
mock barrel.

This previously ran on `node:sqlite` (`DatabaseSync`) against a local file.
That broke in Vercel's serverless functions, whose deployment bundle
(`process.cwd()`) is read-only — the file couldn't even be created, let alone
persisted across cold starts. Postgres removes both problems: no local file,
and the data survives restarts/cold starts because it lives outside the
serverless instance.

**Driver note:** the store's queries run through `pg` (`node-postgres`), not
`@vercel/postgres`. `@vercel/postgres` is still a listed dependency (Vercel's
official client, and the one whose env var names — `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING` — this store reads), but its actual client is
`@neondatabase/serverless`, which speaks Neon's WebSocket proxy protocol and
refuses a plain TCP connection to a non-Neon Postgres. That makes it
impossible to run store tests against a real local Postgres, which is what
this migration prioritized (see "Tests" below). `pg` speaks the standard
Postgres wire protocol and works identically against Vercel Postgres, a local
`postgres` install, or any other standard server, using the exact same
`POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` values Vercel injects. If Vercel
Postgres is ever swapped for a different provider, only the connection string
needs to change.

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
POSTGRES_URL=postgres://user:pass@host:5432/db npm run db:migrate
npm run test:db
POSTGRES_URL=postgres://user:pass@host:5432/db npm run dev
```

`npm run db:migrate` (`scripts/migrate-db.ts`) needs a reachable `POSTGRES_URL`
— it runs against whatever database that URL points to, real Vercel Postgres
included. It calls `store.init()` (idempotent `CREATE TABLE IF NOT EXISTS` DDL,
safe to rerun) before importing legacy data and analyzing collected runs.

**Production (Vercel):** attach a Postgres storage integration to the project
from the Vercel dashboard (Storage tab) — this is a manual step outside what
this codebase can do, since it provisions the database. Once attached, Vercel
auto-injects `POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` (and a few other
`POSTGRES_*` vars) into the project's environment, and `getPromptStore()`
picks them up with no further config.

**Local dev:** install Postgres (e.g. `brew install postgresql@18`), run it,
create a database, and put `POSTGRES_URL=postgres://user@localhost:5432/neodio`
in `.env.local`. `npm run build`/`npm run dev` need this set — pages that
never touch the store still route through `src/components/layout/TopBar.tsx`,
which reads brand data at render time.

### Tests

`npm run test:db` (`scripts/test-pg-harness.mjs`) does **not** use a mock —
this sandbox and CI have no reachable Vercel Postgres, so the harness
`initdb`s and starts a disposable local Postgres cluster in a temp directory,
points `POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` at it, runs the `node:test`
files, then tears the cluster down. This requires a local Postgres install
(`initdb`/`pg_ctl` on `PATH`, or set `PG_BIN_DIR`); `pg-mem` and other
Postgres-compatible mocks were considered but a real server gives higher
confidence for JSONB/constraint/transaction behavior at negligible extra cost
here. Each test gets its own Postgres **schema** (`CREATE SCHEMA test_<uuid>`,
via `src/lib/backend/database/testHelpers.ts`) for the same per-test isolation
SQLite's `":memory:"` used to give, then drops it in `afterEach`.

If you already have `POSTGRES_URL` pointed at a real (non-throwaway) Postgres
instance and want to run the test files directly against it instead of the
harness's disposable cluster, run
`npx tsx --test src/lib/backend/database/*.test.ts` — but note the tests
create and drop schemas on whatever database that URL points to.

Initialization imports library seed rows, saved tracked rows and deletion flags,
strategy seeds, LLM bridge data, and real Naver/Google collector results. It runs
once transactionally for legacy catalog data. Each collector file is subsequently
checked by mtime/size and imported idempotently, preserving run IDs. `db:migrate`
also computes missing analyses; foreign keys are enforced by Postgres on every
write, not checked separately after the fact. Re-running it does not
recreate archived tracking or duplicate executions/analyses. Legacy files are never
deleted or overwritten. Malformed import JSON stops migration with the filename.

Historical `lastModifiedAt` is the only available library timestamp and is used as
an import approximation, recorded as `timestampMeaning=legacy_last_modified` in
source metadata. Names such as "나" become actors of kind `legacy`, not verified
users. New unauthenticated writes use NULL actor IDs instead of inventing identities.
Authentication and mapping actors to real user accounts remain a separate task.

Back up the database with `pg_dump` (or your Postgres provider's managed
backups/point-in-time recovery — Vercel Postgres includes this). Keep `.tmp`
artifacts until the migration is accepted. Going back to legacy code will not
include new Postgres writes; do not treat legacy files as a current backup.

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
for compatibility, but both partitions come from Postgres. The client-safe mock `db`
module still serves demo/research data. Brand configuration, GSC secrets, crawl
artifacts, diagnostic caches and opportunity targets retain their existing stores.
Current routes use the existing default organization/brand; multi-brand account
selection and authorization are not added by this migration.

## Verification

Store tests cover normalized deduplication, tenant constraints, tracking lifecycle,
taxonomy, transactional rollback, source/intent retention, question snapshots,
analysis reuse, and NULL sentiment. API tests use a temporary database, leaving
the application's data unchanged.
