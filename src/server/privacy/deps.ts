import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dependencies for the GDPR Data Subject Request (DSR) use cases — export
 * (right of access/portability) and erasure (right to be forgotten),
 * docs/06 §6.5, docs/09 §9.1/§9.6.
 *
 * Layering (docs/00 §1): the use cases depend on the TENANT-SCOPED Prisma
 * client, so every read/write is forced to the current `organizationId` — a DSR
 * can never touch another tenant's data (the cross-tenant isolation requirement
 * for export/erasure). The erasure flow needs to SEE soft-deleted leads, so the
 * caller wires a client built with `includeSoftDeleted: true`.
 *
 * `actor` carries the server-resolved identity (never client input) so every
 * DSR is written to `AuditLog` with proof of who acted, on whom, when.
 */
export interface PrivacyActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface PrivacyDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: PrivacyActor;
  /** Injectable clock for deterministic `anonymizedAt` / export timestamp. */
  readonly now?: () => Date;
}

export function clockNow(deps: Pick<PrivacyDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
