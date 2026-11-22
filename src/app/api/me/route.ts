import { connection, NextResponse } from "next/server";
import { auth, authEnabled } from "@/backend/auth";
import { dbEnabled } from "@/backend/db/client";

/** Tells the client whether accounts are configured and who (if anyone) is signed in. No database access. */
export async function GET() {
  await connection();
  if (!authEnabled) return NextResponse.json({ enabled: false, sync: false, user: null });
  const session = await auth();
  const u = session?.user;
  return NextResponse.json({
    enabled: true,
    sync: dbEnabled,
    user: u ? { id: u.id || null, name: u.name ?? null, email: u.email ?? null, image: u.image ?? null } : null,
  });
}
