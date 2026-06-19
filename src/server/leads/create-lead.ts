import { resolveCapital } from "@/lib/capital";
import { parseInput } from "@/server/validation";
import { clockNow, type LeadDeps } from "@/server/leads/deps";
import { createLeadSchema } from "@/server/leads/schemas";
import { assertSourceBelongsToTenant } from "@/server/leads/ownership";

/**
 * Create a lead inside the current tenant (docs/02 §2.4, docs/04 §4.3 POST).
 *
 * - The tenant-scoped Prisma client forces `organizationId` on write, so the row
 *   can only ever be created for the caller's tenant.
 * - `ownerId` is taken from the server-resolved actor ("i miei lead").
 * - `sourceId`, when provided, is verified to belong to the SAME tenant
 *   (`NotFoundError` → 404, non-revealing for cross-tenant ids).
 * - Stage defaults to `TO_HANDLE` and `stageChangedAt` to now (schema default),
 *   so "giorni" starts from creation.
 *
 * Returns the new id; the caller re-reads via `getLead` if it needs the detail.
 */
export async function createLead(deps: LeadDeps, input: unknown): Promise<{ id: string }> {
  const data = parseInput(createLeadSchema, input);

  if (data.sourceId) {
    await assertSourceBelongsToTenant(deps, data.sourceId);
  }

  // Capital on create: exact amount OR bracket; the amount wins and the bracket
  // is derived from it (docs/02 §2.4) — single shared resolver, server-side.
  const capital = resolveCapital({
    capitalAmount: data.capitalAmount,
    capitalBracket: data.capitalBracket,
  });

  const now = clockNow(deps);
  const lead = await deps.prisma.lead.create({
    data: {
      // The tenant client also injects this; we set it explicitly so the static
      // Prisma type is satisfied (the extension overwrites with the same value).
      organizationId: deps.actor.organizationId,
      ownerId: deps.actor.userId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      capitalBracket: capital?.capitalBracket ?? null,
      capitalAmount: capital?.capitalAmount ?? null,
      sourceId: data.sourceId ?? null,
      stageChangedAt: now,
    },
    select: { id: true },
  });

  await deps.audit.record({
    action: "lead.create",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: lead.id,
  });

  return lead;
}
