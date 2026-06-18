import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { AppointmentDeps } from "@/server/appointments/deps";

/**
 * Build `AppointmentDeps` from an authenticated tenant context (the wiring used
 * by the appointment Server Actions).
 *
 * The Prisma surface is the TENANT-SCOPED client (forces `organizationId`); the
 * actor identity comes from the SERVER context, never the client. Audit writes go
 * through the BASE client because `AuditLog.organizationId` is set explicitly
 * from the actor.
 */
export function buildAppointmentDeps(ctx: TenantContext): AppointmentDeps {
  return {
    prisma: getTenantPrisma(ctx),
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
