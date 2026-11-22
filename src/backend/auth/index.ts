import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { dbEnabled } from "../db/client";
import { logError } from "../log";
import { resolveUser } from "../services/identity";

/**
 * Google sign-in via Auth.js. Sessions are stateless JWT cookies carrying our internal user id (`users.id`).
 * Everything account-related stays hidden until these env vars are set:
 *   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 *
 * Note: without a database adapter Auth.js gives every sign-in a fresh random `token.sub`, so never use `sub`
 * as a user key. The jwt callback below swaps in our own id instead.
 */
export const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    // Emails are used to link accounts, so only accept addresses Google has verified.
    signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true && Boolean(profile.email);
      return true;
    },
    // `account` is only present at sign-in: that's when we look up (or create) the user, once.
    async jwt({ token, account }) {
      const email = typeof token.email === "string" ? token.email.toLowerCase() : null;
      if (account && email && dbEnabled) {
        try {
          token.uid = await resolveUser({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            email,
            name: token.name ?? null,
            image: token.picture ?? null,
          });
        } catch (err) {
          // Don't block sign-in on a database hiccup; requests fall back to looking the user up by email.
          logError("auth", "resolve-user", err);
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = typeof token.uid === "string" ? token.uid : "";
      return session;
    },
  },
});
