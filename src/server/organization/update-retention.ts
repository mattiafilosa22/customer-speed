import { parseInput } from "@/server/validation";
import type { OrganizationDeps } from "@/server/organization/deps";
import { updateRetentionSchema } from "@/server/organization/schemas";

/**
 * Persist the tenant's LEAD DATA-RETENTION window (docs/09,
 * `Organization.leadRetentionMonths`) — the "N months" a LOST lead (with a
 * recorded loss reason) is kept before it becomes a candidate for the
 * export→purge flow (`src/server/privacy/{list,export,purge}-retention-candidates.ts`).
 * This use case ONLY persists the setting; it never purges anything itself.
 *
 * Validation is the existing `updateRetentionSchema` (Zod): a positive integer
 * (1–120 months) enables the policy, `null` disables it for the tenant.
 *
 * Isolation: writes `where: { id: actor.organizationId }` (server context) —
 * mirrors `updateOrganizationBranding`/`updateOrganizationTheme`, the only
 * other self-service mutations on the `Organization` tenant-root row.
 */
export interface UpdateRetentionResult {
  readonly ok: true;
}

export async function updateOrganizationRetention(
  deps: OrganizationDeps,
  input: unknown,
): Promise<UpdateRetentionResult> {
  const data = parseInput(updateRetentionSchema, input);

  await deps.prisma.organization.update({
    where: { id: deps.actor.organizationId },
    data: { leadRetentionMonths: data.leadRetentionMonths },
  });

  await deps.audit.record({
    action: "settings.retention.update",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Organization",
    entityId: deps.actor.organizationId,
    meta: { leadRetentionMonths: data.leadRetentionMonths },
  });

  return { ok: true };
}
