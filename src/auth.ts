import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google sign-in via Auth.js. Sessions are stateless JWT cookies; the only thing stored server-side is each
 * user's wallet (see src/lib/db.ts). Everything account-related stays hidden until these env vars are set:
 *   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 */
export const authEnabled = Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
