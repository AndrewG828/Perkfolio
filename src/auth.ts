import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google sign-in via Auth.js. Sessions are stateless JWT cookies; the only thing stored server-side is each
 * user's wallet (see src/lib/db.ts). Everything account-related stays hidden until these env vars are set:
 *   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 */
export const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * The stable key for a signed-in person: their Google email, lowercased.
 *
 * Don't use `session.user.id` / `token.sub` for this. Without a database adapter Auth.js gives every sign-in a
 * fresh random UUID, so the same person would get a new id (and an empty wallet) each time they log in.
 */
export function accountKey(session: Session | null): string | null {
  const email = session?.user?.email?.trim().toLowerCase();
  return email || null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    // The email is the account key, so only accept addresses Google has verified.
    signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true && Boolean(profile.email);
      return true;
    },
    session({ session, token }) {
      const key = typeof token.email === "string" ? token.email.toLowerCase() : null;
      if (session.user && key) session.user.id = key;
      return session;
    },
  },
});
