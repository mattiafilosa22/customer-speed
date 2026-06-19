import { NotFoundError } from "@/lib/errors";
import type { LeadDeps } from "@/server/leads/deps";
import { leadDetailSelect, type LeadDetailRow } from "@/server/leads/selectors";

/**
 * Read a single lead's detail (docs/02 §2.5, docs/04 §4.3 GET /:id).
 *
 * Tenant + soft-delete are enforced by the scoped client, so a lead from another
 * tenant (or a soft-deleted one) is simply not found → `NotFoundError` (404,
 * non-revealing). Relations (source, lossReason, notes, externalRefs,
 * stageHistory) are batched in a single query via `leadDetailSelect` (no N+1).
 */
export async function getLead(deps: LeadDeps, leadId: string): Promise<LeadDetailRow> {
  const lead = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: leadDetailSelect,
  });
  if (!lead) {
    throw new NotFoundError("Lead not found");
  }
  return lead;
}
