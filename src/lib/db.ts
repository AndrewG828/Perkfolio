import { neon } from "@neondatabase/serverless";

/** Postgres connection string from the Neon integration on Vercel. */
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
export const dbEnabled = Boolean(url);

let schema: Promise<unknown> | null = null;

export function sql() {
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/** One row per user: their whole wallet as JSON. Created on first use, so there's no migration step. */
export async function ensureSchema() {
  schema ??= sql()`CREATE TABLE IF NOT EXISTS wallets (
    user_id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at bigint NOT NULL
  )`;
  await schema;
}
