import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { PrivacyDeps } from "@/server/privacy/deps";

/**
 * Build `PrivacyDeps` for the GDPR DSR use cases from an authenticated tenant
 * context.
 *
 * The Prisma surface is the TENANT-SCOPED client (forces `organizationId`), and
 * the actor identity comes from the SERVER context — never client input
 * (docs/00 §4, docs/06 §6.3). Audit writes go through the BASE client because
 * `AuditLog.organizationId` is set explicitly from the actor.
 *
 * Export reads only LIVE data, so it uses the default client. Erasure must be
 * able to act on an ALREADY soft-deleted lead, so it opts into
 * `includeSoftDeleted` — without it, a soft-deleted lead would be invisible and
 * the right-to-be-forgotten could not complete.
 */
export function buildExportDeps(ctx: TenantContext): PrivacyDeps {
  return {
    prisma: getTenantPrisma(ctx),
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}

export function buildErasureDeps(ctx: TenantContext): PrivacyDeps {
  return {
    prisma: getTenantPrisma(ctx, { includeSoftDeleted: true }),
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
