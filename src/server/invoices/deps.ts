import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dependencies for the invoice use cases.
 *
 * Same contract as `LeadDeps` (docs/00 §1): the Prisma surface is the
 * TENANT-SCOPED client (forces `organizationId` + soft-delete default), and the
 * `actor` carries the server-resolved identity (never client input) so writes
 * can stamp a correct audit trail (docs/00 §4, docs/06 §6.3).
 */
export interface InvoiceActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface InvoiceDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: InvoiceActor;
}
