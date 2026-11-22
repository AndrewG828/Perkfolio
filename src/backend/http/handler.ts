import "server-only";
import { connection, NextResponse } from "next/server";
import { accountsEnabled, currentUserId } from "../auth/current-user";
import { logError, logEvent, tag } from "../log";
import { HttpError } from "./errors";

export interface UserContext {
  userId: string;
  /** Logs one line for this request, tagged with the user. */
  log: (fields: Record<string, unknown>) => void;
}

/**
 * Wraps an API route handler for a signed-in user: 503 if accounts aren't configured, 401 if signed out,
 * HttpErrors become their status, and anything else is logged and returned as a generic 500.
 */
export function withUser(scope: string, op: string, fn: (req: Request, ctx: UserContext) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    await connection();
    if (!accountsEnabled) return NextResponse.json({ error: "Accounts aren't set up on this server" }, { status: 503 });
    let userId: string | null = null;
    try {
      userId = await currentUserId();
      if (!userId) {
        logEvent(scope, op, { result: "unauthenticated" });
        return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      }
      const user = tag(userId);
      const body = await fn(req, { userId, log: (fields) => logEvent(scope, op, { user, ...fields }) });
      return body instanceof Response ? body : NextResponse.json(body);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      // A session can outlive its user (account deleted on another device).
      if ((err as { code?: string }).code === "23503") {
        return NextResponse.json({ error: "This account no longer exists" }, { status: 401 });
      }
      logError(scope, op, err, userId ? { user: tag(userId) } : {});
      return NextResponse.json({ error: "Something went wrong on our side. Your wallet is still saved in this browser." }, { status: 500 });
    }
  };
}

/** Reads a JSON body with a size limit. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Wallet too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
