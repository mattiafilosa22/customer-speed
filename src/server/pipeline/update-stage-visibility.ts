import { ConflictError, NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { isTerminalStage } from "@/server/leads/stage";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { updateStageVisibilitySchema } from "@/server/pipeline/schemas";

/**
 * Show/hide a single pipeline stage for the tenant (docs/02 §2.3).
 *
 * Server-side invariants (docs/02 §2.3 — enforced HERE, never trusting the UI):
 *  1. **Terminal stages (WON/LOST) cannot be hidden** — they back the KPIs. Any
 *     attempt to hide one is a `ConflictError` (→ 409) with a stable code.
 *  2. **Cannot hide a stage that still holds ACTIVE leads** — otherwise those
 *     leads would vanish from the board with no column. The count is computed
 *     DB-side (`count`, tenant-scoped + soft-delete-filtered) and only checked
 *     when actually HIDING (showing is always allowed).
 *
 * Atomicity: the count check and the write run in ONE `$transaction` so a
 * concurrent lead arriving in the stage cannot slip past the guard.
 */
export interface StageVisibilityResult {
  readonly stage: string;
  readonly isVisible: boolean;
}

/**
 * Stable error codes surfaced to the UI for localized, specific messages. The
 * codes ARE the i18n key paths (resolved from the message root), so the client
 * can localize them directly without a translation table.
 */
export const PIPELINE_CONFIG_ERRORS = {
  TERMINAL_HIDE: "pipeline.errors.config.terminalHide",
  HIDE_WITH_LEADS: "pipeline.errors.config.hideWithLeads",
} as const;

export async function updateStageVisibility(
  deps: PipelineDeps,
  input: unknown,
): Promise<StageVisibilityResult> {
  const data = parseInput(updateStageVisibilitySchema, input);

  // Showing a stage is always safe; only hiding needs the guards.
  if (!data.isVisible) {
    if (isTerminalStage(data.stage)) {
      throw new ConflictError(PIPELINE_CONFIG_ERRORS.TERMINAL_HIDE);
    }
  }

  return deps.prisma.$transaction(async (tx) => {
    const config = await tx.pipelineStageConfig.findUnique({
      where: { organizationId_stage: { organizationId: deps.actor.organizationId, stage: data.stage } },
      select: { id: true },
    });
    if (!config) {
      throw new NotFoundError("Stage config not found");
    }

    if (!data.isVisible) {
      const activeLeads = await tx.lead.count({ where: { stage: data.stage } });
      if (activeLeads > 0) {
        throw new ConflictError(PIPELINE_CONFIG_ERRORS.HIDE_WITH_LEADS);
      }
    }

    await tx.pipelineStageConfig.update({
      where: { id: config.id },
      data: { isVisible: data.isVisible },
    });

    await deps.audit.record({
      action: "pipeline.stage.visibility",
      organizationId: deps.actor.organizationId,
      actorId: deps.actor.userId,
      entity: "PipelineStageConfig",
      entityId: config.id,
      meta: { stage: data.stage, isVisible: data.isVisible },
    });

    return { stage: data.stage, isVisible: data.isVisible };
  });
}
