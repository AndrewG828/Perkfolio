import "server-only";
import { createHash } from "node:crypto";

/** Short, non-reversible tag for a user id in logs. Never log emails. */
export const tag = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 8);

/** One JSON line per event, so Vercel's log search can filter by `scope` and `op`. */
export function logEvent(scope: string, op: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ scope, op, ...fields }));
}

export function logError(scope: string, op: string, err: unknown, fields: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ scope, op, ...fields, error: message.slice(0, 300) }));
}
