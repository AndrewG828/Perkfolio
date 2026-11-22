import { connection, NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";
import { dbEnabled, ensureSchema, sql } from "@/lib/db";

const MAX_BYTES = 256 * 1024;

async function userId(): Promise<string | null> {
  if (!authEnabled || !dbEnabled) return null;
  const session = await auth();
  return session?.user?.id ?? null;
}

/** The signed-in user's saved wallet, or null if they've never synced. */
export async function GET() {
  await connection();
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await ensureSchema();
  const rows = await sql()`SELECT data, updated_at FROM wallets WHERE user_id = ${id}`;
  const row = rows[0] as { data: unknown; updated_at: string | number } | undefined;
  return NextResponse.json(row ? { data: row.data, updatedAt: Number(row.updated_at) } : { data: null, updatedAt: 0 });
}

/** Saves the wallet. Last write wins, but an older copy never overwrites a newer one. */
export async function PUT(req: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  await ensureSchema();
  await sql()`
    INSERT INTO wallets (user_id, data, updated_at) VALUES (${id}, ${JSON.stringify(data)}::jsonb, ${updatedAt})
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
    WHERE wallets.updated_at < EXCLUDED.updated_at`;
  return NextResponse.json({ ok: true });
}
