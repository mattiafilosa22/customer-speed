import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dependencies for the lead use cases.
 *
 * Layering (docs/00 §1): use cases depend on ABSTRACTIONS, not on global
 * singletons. The Prisma surface here is the TENANT-SCOPED client
 * (`getTenantPrismaFromContext()`), so `organizationId` and the soft-delete
 * default are injected at the data layer — a forgotten `where` cannot leak
 * across tenants. Use cases must therefore NEVER receive the base client.
 *
 * `actor` carries the authenticated identity resolved server-side (from the
 * session, never the client) so the use cases can stamp `ownerId`/`authorId`/
 * `changedById` and write a correct audit trail.
 */
export interface LeadActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface LeadDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: LeadActor;
  /** Injectable clock for deterministic `stageChangedAt` in tests. */
  readonly now?: () => Date;
}

export function clockNow(deps: Pick<LeadDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
