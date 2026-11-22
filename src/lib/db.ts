import { neon } from "@neondatabase/serverless";

/** Postgres connection string from the Neon integration on Vercel. */
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
export const dbEnabled = Boolean(url);

let schema: Promise<unknown> | null = null;

export function sql() {
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * One row per person, keyed by their lowercased Google email (see `accountKey` in src/auth.ts):
 *   user_id     the email
 *   data        the whole wallet as JSON (cards, credit usage, ignored credits, bonus progress, cap/visit
 *               tallies, card open dates)
 *   updated_at  the row's version: a server timestamp in ms that only ever goes up. Clients send back the
 *               version they last saw, so a stale device can't overwrite newer data.
 * Created on first use, so there's no migration step.
 */
export async function ensureSchema() {
  schema ??= sql()`CREATE TABLE IF NOT EXISTS wallets (
    user_id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at bigint NOT NULL
  )`;
  try {
    await schema;
  } catch (err) {
    schema = null; // don't cache a failure for the life of the instance
    throw err;
  }
}
