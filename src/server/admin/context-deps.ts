import { env } from "@/lib/env";
import { argon2PasswordHasher } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { SuperAdminContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import { getEmailSender } from "@/server/email";
import type { AdminDeps } from "@/server/admin/deps";
import type { OrganizationDeps } from "@/server/organization";

/**
 * Build `AdminDeps` from an authenticated SUPERADMIN context (the wiring used by
 * the admin Server Actions / Server Components).
 *
 * The Prisma surface is the BASE client — the admin is cross-tenant by design
 * (docs/01 §1.3). The actor is the superAdmin's user id (from the SERVER
 * context, never client input), used as the audit `actorId`.
 */
export function buildAdminDeps(ctx: SuperAdminContext): AdminDeps {
  return {
    prisma,
    hasher: argon2PasswordHasher,
    audit: createAuditLogger(prisma),
    email: getEmailSender(),
    actor: { superAdminUserId: ctx.userId },
    appUrl: env.APP_URL,
  };
}

/**
 * Build `OrganizationDeps` (the REUSED white-label use cases) for the admin
 * acting on a TARGET tenant. This lets the admin theme/brand panel call the
 * exact same `updateOrganizationTheme` / `updateOrganizationBranding` /
 * `getOrganizationBranding` use cases as the tenant's own panel — the only
 * difference is the actor's `organizationId` is the target org (the admin
 * chooses which tenant to configure) and the `userId` is the superAdmin (for
 * audit attribution). The use cases still scope every write to
 * `where: { id: actor.organizationId }`, so only the chosen tenant is touched.
 */
export function buildOrganizationDepsForTarget(
  ctx: SuperAdminContext,
  targetOrganizationId: string,
): OrganizationDeps {
  return {
    prisma,
    audit: createAuditLogger(prisma),
    actor: { organizationId: targetOrganizationId, userId: ctx.userId },
  };
}
