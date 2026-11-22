import type { NeonQueryFunction } from "@neondatabase/serverless";
import { migrations } from "./migrations";

/** Arbitrary constant: serializes migration runs across server instances. */
const LOCK_KEY = 7_262_019;

/**
 * Applies pending migrations in order and returns the ids it applied. Safe to run concurrently: each migration
 * runs in one transaction holding an advisory lock, and if another instance got there first, recording it a
 * second time fails, the transaction rolls back, and it's skipped.
 */
export async function migrate(sql: NeonQueryFunction<false, false>): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    description text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const done = new Set(((await sql`SELECT id FROM schema_migrations`) as { id: string }[]).map((r) => r.id));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    try {
      await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`,
        ...m.statements.map((s) => sql.query(s)),
        sql`INSERT INTO schema_migrations (id, description) VALUES (${m.id}, ${m.description})`,
      ]);
      applied.push(m.id);
    } catch (err) {
      const raced = await sql`SELECT 1 FROM schema_migrations WHERE id = ${m.id}`;
      if (raced.length === 0) throw err;
    }
  }
  return applied;
}
