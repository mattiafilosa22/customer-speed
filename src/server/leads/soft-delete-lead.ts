import { clockNow, type LeadDeps } from "@/server/leads/deps";
import { assertLeadBelongsToTenant } from "@/server/leads/ownership";

/**
 * Soft-delete a lead (docs/02 §2.4 "Eliminare lead", docs/03 §3.4, docs/04
 * §4.3 DELETE /:id). Capability `lead.delete` is checked by the caller layer.
 *
 * We set `deletedAt` instead of a hard delete so the row survives for audit /
 * GDPR (a real erasure is a separate, dedicated flow — docs/06). The scoped
 * client's default read filter (`deletedAt: null`) then hides it from every
 * list and detail read.
 *
 * Ownership is asserted first via a scoped read, so a cross-tenant id — and an
 * already soft-deleted lead — are reported as 404 (non-revealing).
 */
export async function softDeleteLead(deps: LeadDeps, leadId: string): Promise<{ id: string }> {
  await assertLeadBelongsToTenant(deps, leadId);

  await deps.prisma.lead.update({
    where: { id: leadId },
    data: { deletedAt: clockNow(deps) },
  });

  await deps.audit.record({
    action: "lead.delete",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: leadId,
  });

  return { id: leadId };
}
