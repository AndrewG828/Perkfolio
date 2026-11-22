import "server-only";
import { dbEnabled } from "../db/client";
import { userIdForEmail } from "../services/identity";
import { auth, authEnabled } from ".";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when both sign-in and the database are configured. */
export const accountsEnabled = authEnabled && dbEnabled;

/** The signed-in user's id (`users.id`), or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  if (!accountsEnabled) return null;
  const session = await auth();
  const user = session?.user;
  if (!user) return null;
  if (user.id && UUID_RE.test(user.id)) return user.id;
  // Session from before user ids were added: it still carries the verified email.
  const email = user.email?.trim().toLowerCase();
  return email ? userIdForEmail(email) : null;
}
