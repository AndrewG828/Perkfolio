import { createHash } from "node:crypto";
import { connection, NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";
import { dbEnabled, ensureSchema, sql } from "@/lib/db";

const MAX_BYTES = 256 * 1024;

/** Short, non-reversible id for logs — never log emails or raw ids. */
const tag = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 8);

function log(event: Record<string, unknown>) {
  console.log(JSON.stringify({ scope: "wallet-sync", ...event }));
}

async function userId(): Promise<string | null> {
  if (!authEnabled || !dbEnabled) return null;
  const session = await auth();
  return session?.user?.id ?? null;
}

function fail(op: string, user: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ scope: "wallet-sync", op, user: tag(user), error: message.slice(0, 300) }));
  return NextResponse.json({ error: `Database error: ${message.slice(0, 120)}` }, { status: 500 });
}

/** The signed-in user's saved wallet, or null if they've never synced. */
export async function GET() {
  await connection();
  const id = await userId();
  if (!id) {
    log({ op: "get", result: "unauthenticated" });
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    await ensureSchema();
    const rows = await sql()`SELECT data, updated_at FROM wallets WHERE user_id = ${id}`;
    const row = rows[0] as { data: { cards?: unknown[] }; updated_at: string | number } | undefined;
    log({ op: "get", user: tag(id), found: Boolean(row), cards: row?.data?.cards?.length ?? 0, updatedAt: row ? Number(row.updated_at) : 0 });
    return NextResponse.json(row ? { data: row.data, updatedAt: Number(row.updated_at) } : { data: null, updatedAt: 0 });
  } catch (err) {
    return fail("get", id, err);
  }
}

/** Saves the wallet. Last write wins, but an older copy never overwrites a newer one. */
export async function PUT(req: Request) {
  const id = await userId();
  if (!id) {
    log({ op: "put", result: "unauthenticated" });
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Wallet too large" }, { status: 413 });
  let body: { data?: { cards?: unknown; usage?: unknown }; updatedAt?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const data = body.data;
  const updatedAt = Number(body.updatedAt);
  if (!data || !Array.isArray(data.cards) || typeof data.usage !== "object" || !Number.isFinite(updatedAt)) {
    log({ op: "put", user: tag(id), result: "invalid" });
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const rows = await sql()`
      INSERT INTO wallets (user_id, data, updated_at) VALUES (${id}, ${JSON.stringify(data)}::jsonb, ${updatedAt})
      ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      WHERE wallets.updated_at < EXCLUDED.updated_at
      RETURNING updated_at`;
    const saved = rows.length > 0;
    log({ op: "put", user: tag(id), cards: (data.cards as unknown[]).length, updatedAt, saved });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    return fail("put", id, err);
  }
}
