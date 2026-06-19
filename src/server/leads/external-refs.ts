import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { LeadDeps } from "@/server/leads/deps";
import { createExternalRefSchema } from "@/server/leads/schemas";
import { assertLeadBelongsToTenant } from "@/server/leads/ownership";

/**
 * "Aggiornamento dati" — alternative customer data held in an external CRM
 * (docs/02 §2.5 right column, docs/04 §4.7). Create + delete only (no edit in
 * the spec). Capability `lead.note` (per-lead data) gates this at the caller.
 *
 * Tenant + lead ownership enforced via the scoped client; the create also stamps
 * `organizationId` via the extension.
 */

export async function createExternalRef(
  deps: LeadDeps,
  leadId: string,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseInput(createExternalRefSchema, input);
  await assertLeadBelongsToTenant(deps, leadId);

  const ref = await deps.prisma.externalCrmRef.create({
    data: {
      // organizationId explicit for the static type; injected (same value) at runtime.
      organizationId: deps.actor.organizationId,
      leadId,
      altName: data.altName ?? null,
      altEmail: data.altEmail ?? null,
      source: data.source ?? null,
    },
    select: { id: true },
  });

  await deps.audit.record({
    action: "externalRef.create",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "ExternalCrmRef",
    entityId: ref.id,
    meta: { leadId },
  });

  return ref;
}

export async function deleteExternalRef(deps: LeadDeps, refId: string): Promise<{ id: string }> {
  // Scoped findUnique → 404 if missing / other tenant.
  const ref = await deps.prisma.externalCrmRef.findUnique({
    where: { id: refId },
    select: { id: true, leadId: true },
  });
  if (!ref) {
    throw new NotFoundError("External reference not found");
  }

  await deps.prisma.externalCrmRef.delete({ where: { id: refId } });

  await deps.audit.record({
    action: "externalRef.delete",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "ExternalCrmRef",
    entityId: refId,
    meta: { leadId: ref.leadId },
  });

  return { id: refId };
}
