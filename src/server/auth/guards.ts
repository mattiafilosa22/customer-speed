import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

/**
 * Layout-level auth guards. Unlike `getTenantContext()` (which THROWS typed
 * errors for use cases / Route Handlers), these return a nullable result so the
 * calling layout can perform a localized `redirect()` — the correct UX for a
 * server component that gates a whole area.
 *
 * Both re-validate the session against the DB (existence, active, sessionVersion)
 * so a stale/invalidated JWT is rejected (docs/06 §6.1) — never trusting the
 * token alone.
 */
export interface SessionUser {
  readonly id: string;
  readonly organizationId: string;
  readonly role: Role;
  readonly name: string;
  readonly email: string;
}

/** Returns the validated session user, or null when unauthenticated/invalid. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      organizationId: true,
      role: true,
      name: true,
      email: true,
      isActive: true,
      sessionVersion: true,
    },
  });

  if (!dbUser || !dbUser.isActive) return null;
  if (dbUser.sessionVersion !== sessionUser.sessionVersion) return null;

  return {
    id: dbUser.id,
    organizationId: dbUser.organizationId,
    role: dbUser.role,
    name: dbUser.name,
    email: dbUser.email,
  };
}
