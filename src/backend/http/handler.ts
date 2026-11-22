import "server-only";
import { connection, NextResponse } from "next/server";
import { accountsEnabled, currentUserId } from "../auth/current-user";
import { logError, logEvent, tag } from "../log";
import { HttpError } from "./errors";
import { assertBodySize, assertJson, assertSameOrigin, rateLimit } from "./security";

export interface UserContext {
  userId: string;
  /** Logs one line for this request, tagged with the user (hashed, never the email). */
  log: (fields: Record<string, unknown>) => void;
}

export interface RouteOptions {
  /** Changes data: require same-origin and (if `json`) a JSON body. */
  mutation?: boolean;
  json?: boolean;
  maxBytes?: number;
  /** Requests per minute per user. */
  perMinute: number;
}

/** Responses carry one user's data: never cache them anywhere. */
const NO_STORE = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * Wraps an API route for a signed-in user. In order: 503 if accounts aren't configured; for mutations, 403 for
 * cross-site requests, 415 for non-JSON and 413 for oversized bodies; 401 if signed out; 429 over the rate limit.
 * HttpErrors become their status; anything else is logged and returned as a generic 500 (no internals leak).
 * The user id always comes from the session, never from the request, so one user can't reach another's data.
 */
export function withUser(
  scope: string,
  op: string,
  options: RouteOptions,
  fn: (req: Request, ctx: UserContext) => Promise<unknown>,
) {
  return async (req: Request): Promise<Response> => {
    await connection();
    if (!accountsEnabled) return json({ error: "Accounts aren't set up on this server" }, 503);
    let userId: string | null = null;
    try {
      if (options.mutation) {
        assertSameOrigin(req);
        if (options.json) assertJson(req);
        if (options.maxBytes) assertBodySize(req, options.maxBytes);
      }
      userId = await currentUserId();
      if (!userId) {
        logEvent(scope, op, { result: "unauthenticated" });
        return json({ error: "Not signed in" }, 401);
      }
      rateLimit(`${op}:${userId}`, options.perMinute, 60_000);
      const user = tag(userId);
      const body = await fn(req, { userId, log: (fields) => logEvent(scope, op, { user, ...fields }) });
      if (body instanceof Response) {
        for (const [k, v] of Object.entries(NO_STORE)) body.headers.set(k, v);
        return body;
      }
      return json(body);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403 || err.status === 429) logEvent(scope, op, { result: err.status, user: userId ? tag(userId) : undefined });
        return json({ error: err.message }, err.status, err.headers);
      }
      // A session can outlive its user (account deleted on another device).
      if ((err as { code?: string }).code === "23503") return json({ error: "This account no longer exists" }, 401);
      logError(scope, op, err, userId ? { user: tag(userId) } : {});
      return json({ error: "Something went wrong on our side. Your wallet is still saved in this browser." }, 500);
    }
  };
}

/** Reads a JSON body, enforcing the size limit on the actual bytes too. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
