import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dependencies for the organization (white-label settings) use cases.
 *
 * `Organization` is the TENANT ROOT, not a tenant-scoped domain model, so the
 * Prisma Client extension does NOT auto-inject `organizationId` for it (see
 * `TENANT_SCOPED_MODELS`). Isolation is therefore enforced EXPLICITLY here: the
 * use cases only ever read/write `where: { id: actor.organizationId }`, and that
 * id comes from the SERVER context (session) — never from client input. So a
 * tenant can only touch its own organization row.
 *
 * We depend on the minimal Prisma surface (`organization`) to ease faking in
 * tests, plus the audit logger and the resolved actor.
 */
export interface OrganizationActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface OrganizationDeps {
  readonly prisma: Pick<PrismaClient, "organization">;
  readonly audit: AuditLogger;
  readonly actor: OrganizationActor;
}
