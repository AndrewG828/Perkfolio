import { connection, NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";
import { dbEnabled } from "@/lib/db";

/** Tells the client whether accounts are configured and who (if anyone) is signed in. */
export async function GET() {
  await connection();
  if (!authEnabled) return NextResponse.json({ enabled: false, sync: false, user: null });
  const session = await auth();
  const u = session?.user;
  return NextResponse.json({
    enabled: true,
    sync: dbEnabled,
    user: u ? { name: u.name ?? null, email: u.email ?? null, image: u.image ?? null } : null,
  });
}
