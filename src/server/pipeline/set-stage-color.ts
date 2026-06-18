import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { setStageColorSchema } from "@/server/pipeline/schemas";

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
  if (!config) {
    throw new NotFoundError("Stage config not found");
  }

  await deps.prisma.pipelineStageConfig.update({
    where: { id: config.id },
    data: { colorToken: data.colorToken },
  });

  await deps.audit.record({
    action: "pipeline.stage.color",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "PipelineStageConfig",
    entityId: config.id,
    meta: { stage: data.stage, colorToken: data.colorToken },
  });

  return { stage: data.stage, colorToken: data.colorToken };
}
