import { ConflictError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { TERMINAL_STAGES } from "@/server/leads/stage";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { reorderStagesSchema } from "@/server/pipeline/schemas";

/**
 * Reorder the whole pipeline (docs/02 §2.3).
 *
 * Input is the COMPLETE ordered list of stages (validated as a full, duplicate-
 * free set by the schema). We persist a total `sortOrder` (0..n-1) so the board
 * order is unambiguous.
 *
 * Server-side invariant (docs/02 §2.3): the **terminal stages (WON/LOST) must
 * stay at the END** — moving an active stage after a terminal one is incoherent
 * (the funnel must end at Won/Lost, which back the KPIs). We reject any order
 * where a terminal stage precedes a non-terminal one (→ 409, stable code).
 *
 * Atomicity (docs/00 §3): all per-stage `sortOrder` updates run in ONE
 * `$transaction` — the board never observes a half-applied order.
 */
export interface ReorderResult {
  readonly order: readonly string[];
}

export const PIPELINE_REORDER_ERROR = "pipeline.errors.config.terminalNotLast" as const;

export async function reorderStages(deps: PipelineDeps, input: unknown): Promise<ReorderResult> {
  const data = parseInput(reorderStagesSchema, input);

  // Terminal stages must occupy the trailing positions: once we see a terminal
  // stage, every stage after it must also be terminal.
  let seenTerminal = false;
  for (const stage of data.order) {
    const terminal = TERMINAL_STAGES.has(stage);
    if (seenTerminal && !terminal) {
      throw new ConflictError(PIPELINE_REORDER_ERROR);
    }
    if (terminal) {
      seenTerminal = true;
    }
  }

  await deps.prisma.$transaction(
    data.order.map((stage, index) =>
      deps.prisma.pipelineStageConfig.update({
        where: {
          organizationId_stage: { organizationId: deps.actor.organizationId, stage },
        },
        data: { sortOrder: index },
      }),
    ),
  );

  await deps.audit.record({
    action: "pipeline.stage.reorder",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "PipelineStageConfig",
    meta: { order: data.order },
  });

  return { order: data.order };
}
