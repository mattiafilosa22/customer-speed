import { NotFoundError } from "@/lib/errors";
import type { LeadDeps } from "@/server/leads/deps";

/**
 * Tenant-ownership guards.
 *
 * The tenant-scoped Prisma client already injects `organizationId` into every
 * `where`, so a lookup of a cross-tenant id simply returns `null`. These helpers
 * turn that into an explicit `NotFoundError` (→ 404), which is also the correct,
 * non-revealing response for "belongs to another tenant" (docs/04 §4.3,
 * docs/06): the caller cannot distinguish "does not exist" from "not yours".
 *
 * They exist so create/update/changeStage/notes all enforce ownership the SAME
 * way (DRY) and so the negative isolation tests have a single behaviour to
 * assert.
 */

/** Returns the lead id if it exists in the current tenant; else 404. */
export async function assertLeadBelongsToTenant(deps: LeadDeps, leadId: string): Promise<void> {
  const lead = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) {
    throw new NotFoundError("Lead not found");
  }
}

/** Verifies a `LeadSource` id belongs to the current tenant; else 404. */
export async function assertSourceBelongsToTenant(deps: LeadDeps, sourceId: string): Promise<void> {
  const source = await deps.prisma.leadSource.findUnique({
    where: { id: sourceId },
    select: { id: true },
  });
  if (!source) {
    throw new NotFoundError("Lead source not found");
  }
}

/** Verifies a `LossReason` id belongs to the current tenant; else 404. */
export async function assertLossReasonBelongsToTenant(
  deps: LeadDeps,
  lossReasonId: string,
): Promise<void> {
  const reason = await deps.prisma.lossReason.findUnique({
    where: { id: lossReasonId },
    select: { id: true },
  });
  if (!reason) {
    throw new NotFoundError("Loss reason not found");
  }
}

/**
 * Verifies a `Note` belongs to the current tenant and returns its `leadId` (for
 * audit / revalidation). Else 404.
 */
export async function getOwnedNoteLeadId(deps: LeadDeps, noteId: string): Promise<string> {
  const note = await deps.prisma.note.findUnique({
    where: { id: noteId },
    select: { leadId: true },
  });
  if (!note) {
    throw new NotFoundError("Note not found");
  }
  return note.leadId;
}
