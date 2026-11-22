import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { migrate } from "./migrate";

/** Postgres connection string from the Neon integration on Vercel. */
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
export const dbEnabled = Boolean(url);

export type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;
let ready: Promise<unknown> | null = null;

/** The raw Neon client (HTTP driver: one round trip per query, no connection pool to manage). */
export function rawSql(): Sql {
  if (!url) throw new Error("DATABASE_URL is not set");
  client ??= neon(url);
  return client;
}

/**
 * The Neon client, after making sure the schema is current. Pending migrations run once per server instance
 * on first use, so a deploy never needs a separate migration step (`npm run db:migrate` does the same by hand).
 */
export async function db(): Promise<Sql> {
  const sql = rawSql();
  ready ??= migrate(sql);
  try {
    await ready;
  } catch (err) {
    ready = null; // retry on the next request instead of caching the failure
    throw err;
  }
  return sql;
}
