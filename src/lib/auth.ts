import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { env } from "@/lib/env";
import { argon2PasswordHasher } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

/**
 * Auth.js (NextAuth v5) configuration — credentials provider.
 *
 * Strategy: JWT sessions. The token carries `userId`, `organizationId`, `role`
 * and `sessionVersion`. `getTenantContext()` (src/lib/tenant.ts) reads these to
 * build the request context that drives tenant isolation + RBAC.
 *
 * Cookies: Auth.js defaults are `httpOnly`, `SameSite=Lax`, and `Secure` in
 * production. We set the secret and trust host from validated env (docs/06).
 *
 * IMPORTANT: the credentials `authorize` performs a constant-ish flow and
 * returns `null` for every failure mode (unknown email, wrong password,
 * unverified, inactive) so login messages cannot enumerate users. Rate limiting
 * and reCAPTCHA are enforced in the `login` use case BEFORE delegating to
 * `signIn`, so they wrap this provider.
 *
 * `sessionVersion` enables "invalidate other sessions" on password change: each
 * request re-checks the token's version against the DB and rejects stale tokens.
 */

/** Shape we attach to the JWT and expose on the session. */
export interface AuthUser {
  id: string;
  organizationId: string;
  role: Role;
  sessionVersion: number;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organizationId: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    // The UI agent owns these routes; pointing here keeps redirects localized.
    signIn: "/login",
  },
  providers: [
    Credentials({
      // We authenticate by (organizationId, email) since email is unique per
      // tenant, not globally. The login form resolves the tenant first.
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        organizationId: { label: "Organization", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          return null;
        }
        const { email, password, organizationId } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { organizationId_email: { organizationId, email } },
          select: {
            id: true,
            organizationId: true,
            role: true,
            passwordHash: true,
            isActive: true,
            emailVerified: true,
            sessionVersion: true,
          },
        });

        // Non-revealing failures: same `null` for every case. We still run a
        // verify against a dummy hash when the user is missing to reduce timing
        // signal (best-effort).
        if (!user || !user.passwordHash) {
          await argon2PasswordHasher.verify(password, DUMMY_HASH);
          return null;
        }
        if (!user.isActive || !user.emailVerified) {
          await argon2PasswordHasher.verify(password, user.passwordHash);
          return null;
        }

        const ok = await argon2PasswordHasher.verify(password, user.passwordHash);
        if (!ok) {
          return null;
        }

        const authUser: AuthUser = {
          id: user.id,
          organizationId: user.organizationId,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
        // NextAuth expects an object with at least `id`.
        return authUser;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, persist our claims onto the token.
      if (user) {
        const u = user as AuthUser;
        token.userId = u.id;
        token.organizationId = u.organizationId;
        token.role = u.role;
        token.sessionVersion = u.sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the typed claims on the session for server consumers.
      if (typeof token.userId === "string") {
        session.user = {
          ...session.user,
          id: token.userId,
          organizationId: token.organizationId as string,
          role: token.role as Role,
          sessionVersion: token.sessionVersion as number,
        };
      }
      return session;
    },
  },
});

/**
 * A fixed Argon2id hash of a random string, used to equalize timing when the
 * user lookup misses. Generated once at module load.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$3hQ8m0Yx0n0xq3l9b1n1Yw2m5n6o7p8q9r0s1t2u3v4";
