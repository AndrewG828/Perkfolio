import { connection, NextResponse } from "next/server";
import { auth, authEnabled } from "@/backend/auth";
import { dbEnabled } from "@/backend/db/client";

const NO_STORE = { headers: { "cache-control": "private, no-store" } };

/** Tells the client whether accounts are configured and who (if anyone) is signed in. No database access. */
export async function GET() {
  await connection();
  if (!authEnabled) return NextResponse.json({ enabled: false, sync: false, user: null }, NO_STORE);
  const session = await auth();
  const u = session?.user;
  const user = u ? { id: u.id || null, name: u.name ?? null, email: u.email ?? null, image: u.image ?? null } : null;
  return NextResponse.json({ enabled: true, sync: dbEnabled, user }, NO_STORE);
}
