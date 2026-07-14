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
    const existing = await deps.prisma.pipelineStageConfig.findMany({
      where: { organizationId: deps.actor.organizationId },
      select: { stage: true, sortOrder: true },
    });
    const sortOrder = synthesizeSortOrderForStage(data.stage, existing);
    const created = await deps.prisma.pipelineStageConfig.create({
      data: {
        organizationId: deps.actor.organizationId,
        stage: data.stage,
        isVisible: true,
        sortOrder,
        colorToken: data.colorToken,
      },
      select: { id: true },
    });
    configId = created.id;
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
