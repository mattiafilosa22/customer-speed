import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { PipelineDeps } from "@/server/pipeline/deps";

/**
 * Build `PipelineDeps` from an authenticated tenant context (the wiring used by
 * Server Actions and Route Handlers).
 *
 * The Prisma surface is the TENANT-SCOPED client (forces `organizationId` +
 * soft-delete default); the actor identity comes from the SERVER context, never
 * from client input (docs/00 §4, docs/06 §6.3). Audit writes go through the BASE
 * client because `AuditLog.organizationId` is set explicitly from the actor.
 */
export function buildPipelineDeps(ctx: TenantContext): PipelineDeps {
  return {
    prisma: getTenantPrisma(ctx),
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
