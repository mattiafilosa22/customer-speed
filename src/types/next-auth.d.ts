import type { Role } from "@/generated/prisma/enums";

/**
 * Module augmentation for Auth.js (NextAuth v5).
 *
 * Adds our tenant/role claims to the session user and the JWT, so server code
 * (`getTenantContext()`) reads them type-safely instead of casting.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: Role;
      sessionVersion: number;
    } & DefaultSessionUser;
  }
}

// `DefaultSessionUser` is the original (optional name/email/image) shape.
type DefaultSessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    organizationId?: string;
    role?: Role;
    sessionVersion?: number;
  }
}
