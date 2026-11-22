import "server-only";
import { db } from "../db/client";

/** Data access for `users` and their linked sign-in `accounts`. No business rules here: see services/. */

export interface Profile {
  email: string;
  name: string | null;
  image: string | null;
}

export async function findUserIdByAccount(provider: string, providerAccountId: string): Promise<string | null> {
  const sql = await db();
  const rows = (await sql`
    SELECT user_id FROM accounts WHERE provider = ${provider} AND provider_account_id = ${providerAccountId}`) as {
    user_id: string;
  }[];
  return rows[0]?.user_id ?? null;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const sql = await db();
  const rows = (await sql`SELECT id FROM users WHERE email = ${email}`) as { id: string }[];
  return rows[0]?.id ?? null;
}

/** Creates the user for this email, or returns the existing one (refreshing name/image and last login). */
export async function upsertUserByEmail(p: Profile): Promise<string> {
  const sql = await db();
  const rows = (await sql`
    INSERT INTO users (email, name, image) VALUES (${p.email}, ${p.name}, ${p.image})
    ON CONFLICT (email) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, users.name),
      image = COALESCE(EXCLUDED.image, users.image),
      last_login_at = now()
    RETURNING id`) as { id: string }[];
  return rows[0].id;
}

/** Refreshes a returning user's profile. The email follows the provider unless another user already has it. */
export async function touchUser(id: string, p: Profile): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE users SET
      name = COALESCE(${p.name}, name),
      image = COALESCE(${p.image}, image),
      last_login_at = now(),
      email = CASE
        WHEN EXISTS (SELECT 1 FROM users other WHERE other.email = ${p.email} AND other.id <> ${id}) THEN email
        ELSE ${p.email}
      END
    WHERE id = ${id}`;
}

/** Links a sign-in identity to a user. Returns the user it's linked to (an earlier link wins a race). */
export async function linkAccount(userId: string, provider: string, providerAccountId: string): Promise<string> {
  const sql = await db();
  await sql`
    INSERT INTO accounts (provider, provider_account_id, user_id) VALUES (${provider}, ${providerAccountId}, ${userId})
    ON CONFLICT (provider, provider_account_id) DO NOTHING`;
  return (await findUserIdByAccount(provider, providerAccountId)) ?? userId;
}

/** Deletes the user; their linked accounts and wallet go with them (ON DELETE CASCADE). */
export async function deleteUser(id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
