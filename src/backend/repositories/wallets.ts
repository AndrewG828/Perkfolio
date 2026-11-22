import "server-only";
import { db } from "../db/client";

/** Data access for `wallets`: one JSON wallet per user, with a version for optimistic concurrency. */

export interface StoredWallet {
  data: unknown;
  version: number;
}

const toWallet = (row: { data: unknown; version: string | number } | undefined): StoredWallet =>
  row ? { data: row.data, version: Number(row.version) } : { data: null, version: 0 };

export async function getWallet(userId: string): Promise<StoredWallet> {
  const sql = await db();
  const rows = (await sql`SELECT data, version FROM wallets WHERE user_id = ${userId}`) as {
    data: unknown;
    version: string | number;
  }[];
  return toWallet(rows[0]);
}

/**
 * Saves `data` only if the stored version still equals `base` (or there's no wallet yet).
 * The new version is a server timestamp in ms, always above the previous one, so device clocks don't matter.
 */
export async function saveWallet(
  userId: string,
  data: unknown,
  base: number,
): Promise<{ saved: true; version: number } | { saved: false; current: StoredWallet }> {
  const sql = await db();
  const rows = (await sql`
    INSERT INTO wallets (user_id, data, version) VALUES (${userId}, ${JSON.stringify(data)}::jsonb, ${Date.now()})
    ON CONFLICT (user_id) DO UPDATE SET
      data = EXCLUDED.data,
      version = GREATEST(EXCLUDED.version, wallets.version + 1),
      updated_at = now()
    WHERE wallets.version = ${base}
    RETURNING version`) as { version: string | number }[];
  if (rows.length > 0) return { saved: true, version: Number(rows[0].version) };
  return { saved: false, current: await getWallet(userId) };
}
