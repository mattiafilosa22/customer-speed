import type { TenantPrismaClient } from "@/lib/prisma-tenant";

/**
 * Dependencies for the loss-reason use cases (Settings CRUD, docs/02 §2.5-bis).
 *
 * Mirrors `LeadDeps`/`PipelineDeps` (docs/00 §1): the Prisma surface is the
 * TENANT-SCOPED client, so `organizationId` is injected at the data layer for
 * every read/write — a forgotten `where` cannot leak across tenants. Only the
 * `lossReason` delegate (+ `$transaction`, needed by the atomic reorder) is
 * exposed, to ease faking in tests and keep the surface minimal (ISP).
 *
 * No `audit` field: unlike the GDPR use cases (`PrivacyDeps`), these are NOT
 * operations on personal data — a renamed/reordered/deactivated loss reason is
 * tenant configuration, not a data-subject event. This mirrors `LeadSource`,
 * the sibling reference-data model, which has no audit trail either.
 */
export interface LossReasonActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface LossReasonDeps {
  readonly prisma: Pick<TenantPrismaClient, "lossReason" | "$transaction">;
  readonly actor: LossReasonActor;
}
