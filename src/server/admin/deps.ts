import type { PrismaClient } from "@/generated/prisma/client";
import type { PasswordHasher } from "@/lib/password";
import type { AuditLogger } from "@/server/audit/audit-log";
import type { EmailSender } from "@/server/email/types";

/**
 * Dependencies for the cross-tenant `superAdmin` admin use cases (docs/01 §1.3,
 * docs/02 §2.1).
 *
 * CRITICAL — the superAdmin path is the EXPLICIT, AUDITED cross-tenant context:
 *  - The Prisma surface is the BASE `PrismaClient`, NEVER the tenant-scoped one
 *    (`src/lib/prisma-tenant.ts`). The admin legitimately reads/writes across all
 *    tenants (list every organization, create a tenant, aggregate global metrics),
 *    so the per-tenant `organizationId` injection would be WRONG here. Tenant
 *    isolation does not apply to the operator; instead every action is recorded.
 *  - Every mutation AND the global-metrics read records an `AuditLog` entry whose
 *    `actorId` is the superAdmin and whose `organizationId` is the affected tenant
 *    (or `null` for truly global reads), so cross-tenant access is always traceable
 *    (docs/00 §3, docs/06 §6.4).
 *  - The actor (`superAdminUserId`) comes from the SERVER context (session), never
 *    from client input.
 *
 * Everything the use cases touch is injected (Dependency Inversion, docs/00 §1):
 * Prisma, password hasher, audit logger and email sender are ports, so the use
 * cases are unit-testable with fakes and hold no hidden imports.
 */
export interface AdminActor {
  /** The authenticated superAdmin's user id — used as the audit `actorId`. */
  readonly superAdminUserId: string;
}

export interface AdminDeps {
  /** BASE client — cross-tenant by construction. NEVER the tenant-scoped one. */
  readonly prisma: PrismaClient;
  readonly hasher: PasswordHasher;
  readonly audit: AuditLogger;
  readonly email: EmailSender;
  readonly actor: AdminActor;
  /** Base URL for invitation/reset links in emails. */
  readonly appUrl: string;
  /** Injectable clock for deterministic token expiry in tests. */
  readonly now?: () => Date;
}

export function clockNow(deps: Pick<AdminDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
