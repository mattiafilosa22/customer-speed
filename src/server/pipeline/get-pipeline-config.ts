import type { LeadStage } from "@/generated/prisma/enums";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { STAGE_ORDER, isTerminalStage } from "@/server/leads/stage";

/**
 * One stage's tenant configuration row (docs/03 PipelineStageConfig).
 * `colorToken` is the optional `--stage-*` override (null → default token).
 * `leadCount` is the number of ACTIVE (non-soft-deleted) leads currently in the
 * stage — used both by the config UI (to gate hiding) and to label columns.
 */
export interface PipelineStageConfigItem {
  readonly stage: LeadStage;
  readonly isVisible: boolean;
  readonly sortOrder: number;
  readonly colorToken: string | null;
  readonly isTerminal: boolean;
  readonly leadCount: number;
}

export interface PipelineConfigResult {
  readonly stages: readonly PipelineStageConfigItem[];
}

/**
 * Read the full pipeline configuration for the tenant, ordered by `sortOrder`,
 * enriched with the per-stage active-lead count.
 *
 * Performance (docs/00 §3 — aggregates DB-side, zero N+1): exactly TWO queries,
 * run concurrently — one `findMany` for the configs and one `groupBy` for the
 * counts — both tenant-scoped + soft-delete-filtered by the extension. The
 * counts are joined to the configs in memory (a 9-element map), never per row.
 *
 * Defensive completeness: should a tenant be missing a config row for some stage
 * (e.g. a stage added after that tenant was seeded), we synthesize a sensible
 * default so the board/config never silently drops a stage.
 */
export async function getPipelineConfig(deps: PipelineDeps): Promise<PipelineConfigResult> {
  const [configs, grouped] = await Promise.all([
    deps.prisma.pipelineStageConfig.findMany({
      orderBy: { sortOrder: "asc" },
      select: { stage: true, isVisible: true, sortOrder: true, colorToken: true },
    }),
    deps.prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
  ]);

  const counts = new Map<LeadStage, number>();
  for (const group of grouped) {
    counts.set(group.stage, group._count._all);
  }

  const byStage = new Map(configs.map((c) => [c.stage, c]));

  // Iterate the canonical stage set so the result is always complete and stable,
  // then sort by the persisted order (defaults fall back to the canonical index).
  const stages: PipelineStageConfigItem[] = STAGE_ORDER.map((stage, index) => {
    const config = byStage.get(stage);
    return {
      stage,
      isVisible: config?.isVisible ?? true,
      sortOrder: config?.sortOrder ?? index,
      colorToken: config?.colorToken ?? null,
      isTerminal: isTerminalStage(stage),
      leadCount: counts.get(stage) ?? 0,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  return { stages };
}
