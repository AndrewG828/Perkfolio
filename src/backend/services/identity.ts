import "server-only";
import { findUserIdByAccount, findUserIdByEmail, linkAccount, touchUser, upsertUserByEmail } from "../repositories/users";

export interface SignInIdentity {
  provider: string;
  /** The provider's permanent id for the person (Google's `sub`). */
  providerAccountId: string;
  /** Verified email, lowercased. */
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * Maps a sign-in to our user id, creating the user on first sign-in.
 * 1. Known identity (same Google account): that user, even if their email has since changed.
 * 2. New identity, known verified email: link it to that user (e.g. adopted from the old email-keyed wallets).
 * 3. Otherwise: a new user.
 */
export async function resolveUser(identity: SignInIdentity): Promise<string> {
  const profile = { email: identity.email, name: identity.name, image: identity.image };
  const known = await findUserIdByAccount(identity.provider, identity.providerAccountId);
  if (known) {
    await touchUser(known, profile);
    return known;
  }
  const userId = await upsertUserByEmail(profile);
  return linkAccount(userId, identity.provider, identity.providerAccountId);
}

/**
 * For sessions issued before user ids existed (they only carry an email): the existing user, if any. Never creates
 * one, so an old session can't bring back a deleted account; those users just sign in again.
 */
export async function userIdForEmail(email: string): Promise<string | null> {
  return findUserIdByEmail(email);
}
