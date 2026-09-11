import { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import { resolveCapital } from "@/lib/capital";
import { parseInput } from "@/server/validation";
import type { LeadDeps } from "@/server/leads/deps";
import { updateLeadSchema } from "@/server/leads/schemas";
import { assertLeadBelongsToTenant, assertSourceBelongsToTenant } from "@/server/leads/ownership";
import { requireChannelForLinkedSource } from "@/server/leads/chat-channel";

/**
 * Update a lead's contact / capital / source / admin-notes fields
 * (docs/02 §2.5, docs/04 §4.3 PATCH /:id). Stage is intentionally NOT updatable
 * here — see `changeStage` (it must also write `StageHistory` atomically).
 *
 * Semantics: a property present with `null` clears the column; absent leaves it
 * untouched. `sourceId`, when set to a value, is verified against the tenant.
 * The `update` runs through the tenant-scoped client, so it can only ever match
 * a row in the caller's tenant; a non-existent / cross-tenant id surfaces as
 * `NotFoundError` (404) via the `P2025` mapping below.
 */
export async function updateLead(
  deps: LeadDeps,
  leadId: string,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseInput(updateLeadSchema, input);

  // Explicit ownership read (scoped): cross-tenant / soft-deleted / missing → 404.
  await assertLeadBelongsToTenant(deps, leadId);
  const current = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: { sourceId: true, chatChannel: true },
  });
  if (!current) {
    throw new NotFoundError("Lead not found");
  }

  if (data.sourceId) {
    await assertSourceBelongsToTenant(deps, data.sourceId);
  }
  const resultingSourceId = data.sourceId === undefined ? current.sourceId : data.sourceId;
  const resultingChannel =
    data.chatChannel === undefined ? current.chatChannel : data.chatChannel;
  await requireChannelForLinkedSource(deps, resultingSourceId, resultingChannel);

  // Build a minimal `data` payload containing only the provided keys so we never
  // overwrite untouched columns.
  const updateData: Prisma.LeadUpdateInput = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.email !== undefined) updateData.email = data.email ?? null;
  if (data.phone !== undefined) updateData.phone = data.phone ?? null;
  // Capital: exact amount OR bracket — derive the bracket from the amount and
  // keep both columns consistent (docs/02 §2.4). Resolved once, server-side.
  const capital = resolveCapital({
    capitalAmount: data.capitalAmount,
    capitalBracket: data.capitalBracket,
  });
  if (capital !== undefined) {
    updateData.capitalBracket = capital.capitalBracket;
    updateData.capitalAmount = capital.capitalAmount;
  }
  if (data.adminNotes !== undefined) updateData.adminNotes = data.adminNotes ?? null;
  if (data.sourceId !== undefined) {
    updateData.source = data.sourceId ? { connect: { id: data.sourceId } } : { disconnect: true };
  }
  if (data.chatChannel !== undefined) updateData.chatChannel = data.chatChannel;

  try {
    const lead = await deps.prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      select: { id: true },
    });

    await deps.audit.record({
      action: "lead.update",
      organizationId: deps.actor.organizationId,
      actorId: deps.actor.userId,
      entity: "Lead",
      entityId: lead.id,
      meta: { fields: Object.keys(updateData) },
    });

    return lead;
  } catch (error) {
    // Prisma throws P2025 when `update` matches no row (wrong/other tenant id).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new NotFoundError("Lead not found");
    }
    throw error;
  }
}
