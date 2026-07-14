import { ConflictError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { isTerminalStage } from "@/server/leads/stage";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { updateStageVisibilitySchema } from "@/server/pipeline/schemas";
import { synthesizeSortOrderForStage } from "@/server/pipeline/stage-order";

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

    if (!data.isVisible) {
      const activeLeads = await tx.lead.count({ where: { stage: data.stage } });
      if (activeLeads > 0) {
        throw new ConflictError(PIPELINE_CONFIG_ERRORS.HIDE_WITH_LEADS);
      }
    }

    let configId: string;
    if (config) {
      await tx.pipelineStageConfig.update({
        where: { id: config.id },
        data: { isVisible: data.isVisible },
      });
      configId = config.id;
    } else {
      // Self-heal (docs/03 §3.3 "tenant esistenti"): this tenant predates
      // `data.stage` being added to the `LeadStage` enum, so it has no config
      // row for it yet — `getPipelineConfig` only SYNTHESIZES a default for
      // display, it never persists one. Create the row now (sortOrder
      // interpolated to match where the tenant already sees it on the board)
      // so the mutation has something to attach to instead of 404ing.
      //
      // `upsert`, not `create`: the `findUnique` above and this write are NOT
      // atomic together, so two concurrent requests for the SAME not-yet-
      // materialized row (realistic right after this stage is deployed, when
      // every pre-existing tenant is missing it) can both observe `config ===
      // null` and both reach this branch. A plain `create` would then throw an
      // unhandled `P2002` against `@@unique([organizationId, stage])` for
      // whichever request loses the race (raw 500, not a clean application
      // error). `upsert` is race-safe: Postgres executes it as a single
      // `INSERT ... ON CONFLICT (organizationId, stage) DO UPDATE`, so the
      // losing request atomically updates the winner's just-inserted row
      // instead of throwing (same pattern as `reorder-stages.ts`).
      const existing = await tx.pipelineStageConfig.findMany({
        where: { organizationId: deps.actor.organizationId },
        select: { stage: true, sortOrder: true },
      });
      const sortOrder = synthesizeSortOrderForStage(data.stage, existing);
      const upserted = await tx.pipelineStageConfig.upsert({
        where: {
          organizationId_stage: { organizationId: deps.actor.organizationId, stage: data.stage },
        },
        update: { isVisible: data.isVisible },
        create: {
          organizationId: deps.actor.organizationId,
          stage: data.stage,
          isVisible: data.isVisible,
          sortOrder,
        },
        select: { id: true },
      });
      configId = upserted.id;
    }

    await deps.audit.record({
      action: "pipeline.stage.visibility",
      organizationId: deps.actor.organizationId,
      actorId: deps.actor.userId,
      entity: "PipelineStageConfig",
      entityId: configId,
      meta: { stage: data.stage, isVisible: data.isVisible },
    });

    return { stage: data.stage, isVisible: data.isVisible };
  });
}
