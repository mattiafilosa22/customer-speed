import { prisma } from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { OrganizationDeps } from "@/server/organization/deps";

/**
 * Build `OrganizationDeps` from an authenticated tenant context (the wiring used
 * by the appearance/brand Server Actions).
 *
 * The Organization row is the tenant root, so the BASE client is used and the
 * use cases scope every access to `actor.organizationId` (from the SERVER
 * context, never the client). Audit writes set `organizationId` explicitly.
 */
export function buildOrganizationDeps(ctx: TenantContext): OrganizationDeps {
  return {
    prisma,
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
