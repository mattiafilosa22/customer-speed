import { NotFoundError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import { clockNow, type LeadDeps } from "@/server/leads/deps";
import { changeStageSchema } from "@/server/leads/schemas";
import { assertLossReasonBelongsToTenant } from "@/server/leads/ownership";

/**
 * Move a lead to a new stage (docs/02 §2.3/§2.5, docs/04 §4.3 PATCH /:id/stage).
 *
 * Invariants enforced here:
 *  1. **LOST requires a loss reason** — validated by the schema, and the
 *     `lossReasonId` is verified to belong to the tenant (else 404).
 *  2. **Atomicity** — `stage` + `stageChangedAt` on the lead AND the new
 *     `StageHistory` row are written in ONE `$transaction`: either both land or
 *     neither (docs/00 §3). `stageChangedAt` is reset so "giorni" restarts.
 *  3. **No-op short-circuit** — moving to the SAME stage is rejected as a
 *     no-op-conflict? No: we treat it as idempotent success WITHOUT touching
 *     `stageChangedAt` (re-saving the same stage must not reset the day counter).
 *  4. **Tenant scoping** — every query uses the scoped client; a cross-tenant /
 *     soft-deleted lead is not found.
 *
 * When the move LEAVES the LOST stage (to anything else) the stored
 * `lossReasonId` is cleared, so a re-opened lead does not keep a stale reason.
 */
export interface ChangeStageResult {
  readonly id: string;
  readonly changed: boolean;
}

export async function changeStage(
  deps: LeadDeps,
  leadId: string,
  input: unknown,
): Promise<ChangeStageResult> {
  const data = parseInput(changeStageSchema, input);

  if (data.stage === LeadStage.LOST && data.lossReasonId) {
    await assertLossReasonBelongsToTenant(deps, data.lossReasonId);
  }

  const now = clockNow(deps);

  return deps.prisma.$transaction(async (tx) => {
    // Read current stage inside the tx (scoped → tenant + not soft-deleted).
    const current = await tx.lead.findUnique({
      where: { id: leadId },
      select: { id: true, stage: true },
    });
    if (!current) {
      throw new NotFoundError("Lead not found");
    }

    // Idempotent same-stage save: do not reset the day counter, no history row.
    if (current.stage === data.stage) {
      return { id: current.id, changed: false };
    }

    const movingToLost = data.stage === LeadStage.LOST;

    await tx.lead.update({
      where: { id: leadId },
      data: {
        stage: data.stage,
        stageChangedAt: now,
        // Set the reason only when entering LOST; clear it on any other move.
        lossReasonId: movingToLost ? data.lossReasonId : null,
      },
    });

    await tx.stageHistory.create({
      data: {
        // Explicit for the static type; the tenant client injects the same value.
        organizationId: deps.actor.organizationId,
        leadId,
        fromStage: current.stage,
        toStage: data.stage,
        changedById: deps.actor.userId,
        changedAt: now,
      },
    });

    await deps.audit.record({
      action: "lead.stage.change",
      organizationId: deps.actor.organizationId,
      actorId: deps.actor.userId,
      entity: "Lead",
      entityId: leadId,
      meta: { from: current.stage, to: data.stage },
    });

    return { id: leadId, changed: true };
  });
}
