import { createHash } from "node:crypto";
import { connection, NextResponse } from "next/server";
import { accountKey, auth, authEnabled } from "@/auth";
import { dbEnabled, ensureSchema, sql } from "@/lib/db";
import { isWalletLike } from "@/lib/wallet-merge";

const MAX_BYTES = 256 * 1024;

/** Short, non-reversible id for logs — never log emails. */
const tag = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 8);

function log(event: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: "wallet-sync", ...event }));
}

async function userKey(): Promise<string | null> {
  if (!authEnabled || !dbEnabled) return null;
  return accountKey(await auth());
}

function fail(op: string, user: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ scope: "wallet-sync", op, user: tag(user), error: message.slice(0, 300) }));
  return NextResponse.json({ error: `Database error: ${message.slice(0, 120)}` }, { status: 500 });
}

type Row = { data: { cards?: unknown[] }; updated_at: string | number };

async function current(id: string) {
  const rows = (await sql()`SELECT data, updated_at FROM wallets WHERE user_id = ${id}`) as Row[];
  const row = rows[0];
  return row ? { data: row.data, version: Number(row.updated_at) } : { data: null, version: 0 };
}

/** The signed-in user's saved wallet and its version (0 and null data if they've never synced). */
export async function GET() {
  await connection();
  const id = await userKey();
  if (!id) {
    log({ op: "get", result: "unauthenticated" });
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    await ensureSchema();
    const row = await current(id);
    log({ op: "get", user: tag(id), found: Boolean(row.data), cards: row.data?.cards?.length ?? 0, version: row.version });
    return NextResponse.json(row);
  } catch (err) {
    return fail("get", id, err);
  }
}

/**
 * Saves the wallet if the client's `base` matches the stored version (optimistic concurrency).
 * - 200 `{ ok, version }`: saved; `version` is the new version.
 * - 409 `{ conflict, data, version }`: another device saved first. The client merges and retries.
 */
export async function PUT(req: Request) {
  const id = await userKey();
  if (!id) {
    log({ op: "put", result: "unauthenticated" });
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Wallet too large" }, { status: 413 });
  let body: { data?: unknown; base?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const base = Number(body.base ?? 0);
  if (!isWalletLike(body.data) || !Number.isFinite(base)) {
    log({ op: "put", user: tag(id), result: "invalid" });
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  const data = body.data;
  try {
    await ensureSchema();
    const rows = (await sql()`
      INSERT INTO wallets (user_id, data, updated_at) VALUES (${id}, ${JSON.stringify(data)}::jsonb, ${Date.now()})
      ON CONFLICT (user_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = GREATEST(EXCLUDED.updated_at, wallets.updated_at + 1)
        WHERE wallets.updated_at = ${base}
      RETURNING updated_at`) as { updated_at: string | number }[];
    if (rows.length === 0) {
      const latest = await current(id);
      log({ op: "put", user: tag(id), cards: data.cards.length, base, result: "conflict", version: latest.version });
      return NextResponse.json({ conflict: true, ...latest }, { status: 409 });
    }
    const version = Number(rows[0].updated_at);
    log({ op: "put", user: tag(id), cards: data.cards.length, base, result: "saved", version });
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    return fail("put", id, err);
  }
}
