import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { InsightDeps } from "@/server/insight/deps";

/**
 * Build `InsightDeps` from un contesto tenant autenticato (il wiring usato da
 * Server Actions e Route Handlers).
 *
 * Il client Prisma è quello TENANT-SCOPED (forza `organizationId`), e
 * l'identità dell'attore arriva dal contesto SERVER — mai dall'input client
 * (docs/00 §4, docs/06 §6.3). Gli audit passano dal client BASE perché
 * `AuditLog.organizationId` è valorizzato esplicitamente dall'attore (e
 * l'audit deve essere scrivibile anche fuori dal filtro tenant/soft-delete).
 */
export function buildInsightDeps(ctx: TenantContext): InsightDeps {
  return {
    prisma: getTenantPrisma(ctx),
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
