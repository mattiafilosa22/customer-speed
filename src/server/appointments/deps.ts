import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dependencies for the appointment use cases.
 *
 * Same contract as `LeadDeps`/`InvoiceDeps` (docs/00 §1): the Prisma surface is
 * the TENANT-SCOPED client (forces `organizationId` on reads + writes), and the
 * `actor` carries the server-resolved identity (never client input) so writes
 * can stamp `ownerId` and a correct audit trail (docs/00 §4, docs/06 §6.3).
 */
export interface AppointmentActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface AppointmentDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: AppointmentActor;
}
