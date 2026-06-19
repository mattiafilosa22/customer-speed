import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dependencies for the pipeline use cases.
 *
 * Mirrors `LeadDeps` (docs/00 §1): use cases depend on the TENANT-SCOPED Prisma
 * client (`organizationId` + soft-delete injected at the data layer), the audit
 * logger and the resolved server-side actor — never on global singletons, never
 * on client-supplied identity.
 */
export interface PipelineActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface PipelineDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: PipelineActor;
}
