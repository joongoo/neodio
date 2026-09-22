import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PromptStore } from "./store";

// Each test gets its own Postgres schema instead of SQLite's ":memory:" —
// same isolation (a fresh, empty database per test), but against the real
// Postgres wire protocol so the SQL in store.ts is actually exercised.
// Requires POSTGRES_URL (see docs/database.md — `npm run test:db` starts a
// throwaway local Postgres cluster for this automatically).
export interface TestStoreHandle { store: PromptStore; schema: string; pool: Pool }

export async function createTestStore(): Promise<TestStoreHandle> {
  const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("POSTGRES_URL is required to run store tests — see docs/database.md");
  const schema = `test_${randomUUID().replaceAll("-", "_")}`;
  const setup = new Pool({ connectionString });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.end();
  const pool = new Pool({ connectionString: `${connectionString}${connectionString.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}` });
  const store = new PromptStore(pool);
  await store.init();
  return { store, schema, pool };
}

export async function dropTestStore(handle: TestStoreHandle): Promise<void> {
  await handle.pool.end();
  const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL!;
  const cleanup = new Pool({ connectionString });
  await cleanup.query(`DROP SCHEMA IF EXISTS "${handle.schema}" CASCADE`);
  await cleanup.end();
}
