import "server-only";
import { HttpError } from "./errors";

/**
 * Request checks for API routes that change data. Session cookies are SameSite=Lax and our routes send no CORS
 * headers, so browsers already block other sites from calling them; these checks are defense in depth.
 */

/** Rejects cross-site requests: the Origin (sent by browsers on every PUT/DELETE fetch) must be this site. */
export function assertSameOrigin(req: Request) {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new HttpError(403, "Cross-site request blocked");
  const origin = req.headers.get("origin");
  if (!origin) throw new HttpError(403, "Missing Origin header");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Bad Origin header");
  }
  if (!host || originHost !== host) throw new HttpError(403, "Cross-site request blocked");
}

/** Requires a JSON body (which also forces a CORS preflight for any cross-site caller). */
export function assertJson(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Expected application/json");
}

/** Rejects bodies over `maxBytes` before reading them when the client declares a length. */
export function assertBodySize(req: Request, maxBytes: number) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new HttpError(413, "Request too large");
}

/**
 * Fixed-window rate limit per key, in memory. Each server instance counts on its own, so this caps bursts from a
 * single signed-in user (a runaway tab, a script with a stolen cookie) rather than being a global quota.
 * For hard limits across instances, add a Vercel Firewall rate-limit rule.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return;
  }
  w.count++;
  if (w.count > limit) {
    throw new HttpError(429, "Too many requests. Slow down and try again in a minute.", {
      "retry-after": String(Math.ceil((w.resetAt - now) / 1000)),
    });
  }
}
