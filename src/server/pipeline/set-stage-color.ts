import { parseInput } from "@/server/validation";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { setStageColorSchema } from "@/server/pipeline/schemas";
import { synthesizeSortOrderForStage } from "@/server/pipeline/stage-order";

/**
 * Override (or reset) a stage's colour token for the tenant (docs/02 §2.3,
 * docs/05 §5.3). The token is validated by the schema to be a `--stage-*` CSS
 * custom property (or null to reset) — never arbitrary CSS, so it cannot carry
 * an injection payload into an inline `style`.
 */
export interface SetStageColorResult {
  readonly stage: string;
  readonly colorToken: string | null;
}

export async function setStageColor(
  deps: PipelineDeps,
  input: unknown,
): Promise<SetStageColorResult> {
  const data = parseInput(setStageColorSchema, input);

  const config = await deps.prisma.pipelineStageConfig.findUnique({
    where: {
      organizationId_stage: { organizationId: deps.actor.organizationId, stage: data.stage },
    },
    select: { id: true },
  });

  let configId: string;
  if (config) {
    await deps.prisma.pipelineStageConfig.update({
      where: { id: config.id },
      data: { colorToken: data.colorToken },
    });
    configId = config.id;
  } else {
    // Self-heal (docs/03 §3.3 "tenant esistenti"): this tenant predates
    // `data.stage` being added to the `LeadStage` enum, so it has no config row
    // for it yet — `getPipelineConfig` only SYNTHESIZES a default for display,
    // it never persists one. Create the row now (visible by default, sortOrder
    // interpolated to match where the tenant already sees it on the board) so
    // the mutation has something to attach to instead of 404ing.
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
    const existing = await deps.prisma.pipelineStageConfig.findMany({
      where: { organizationId: deps.actor.organizationId },
      select: { stage: true, sortOrder: true },
    });
    const sortOrder = synthesizeSortOrderForStage(data.stage, existing);
    const upserted = await deps.prisma.pipelineStageConfig.upsert({
      where: {
        organizationId_stage: { organizationId: deps.actor.organizationId, stage: data.stage },
      },
      update: { colorToken: data.colorToken },
      create: {
        organizationId: deps.actor.organizationId,
        stage: data.stage,
        isVisible: true,
        sortOrder,
        colorToken: data.colorToken,
      },
      select: { id: true },
    });
    configId = upserted.id;
  }

  await deps.audit.record({
    action: "pipeline.stage.color",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "PipelineStageConfig",
    entityId: configId,
    meta: { stage: data.stage, colorToken: data.colorToken },
  });

  return { stage: data.stage, colorToken: data.colorToken };
}
