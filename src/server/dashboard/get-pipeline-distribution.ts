import { Prisma } from "@/generated/prisma/client";
import type { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import type { DashboardDeps } from "@/server/dashboard/deps";
import { periodFilter, periodSchema } from "@/server/dashboard/period";

/**
 * Pipeline distribution (docs/02 §2.2): one counter per VISIBLE stage with the
 * number of leads currently in it, scoped to the period.
 *
 * "Del periodo" = leads whose `createdAt` is in the period (same anchor as the
 * KPI lead counts and the kanban board, so the figures reconcile across views).
 * HIDDEN stages are excluded (docs/02 §2.2/§2.3) — but the counters never
 * "lose" leads silently: a hidden stage simply has no column here, exactly like
 * on the board.
 *
 * Performance (docs/00 §3): TWO concurrent queries, no records loaded —
 *  - ONE `findMany` over the small `PipelineStageConfig` table (visible stages,
 *    ordered) and
 *  - ONE `groupBy(stage)` over leads.
 * Counts are joined to the ordered visible stages in memory; absent groups → 0,
 * so a visible-but-empty stage still renders its column.
 */

export interface PipelineDistributionItem {
  readonly stage: LeadStage;
  readonly count: number;
}

export interface PipelineDistributionResult {
  readonly stages: readonly PipelineDistributionItem[];
}

export async function getPipelineDistribution(
  deps: DashboardDeps,
  input: unknown,
): Promise<PipelineDistributionResult> {
  const period = parseInput(periodSchema, input);
  const range = periodFilter(period);
  const where: Prisma.LeadWhereInput = range ? { createdAt: range } : {};

  const [configs, grouped] = await Promise.all([
    deps.prisma.pipelineStageConfig.findMany({
      where: { isVisible: true },
      orderBy: { sortOrder: "asc" },
      select: { stage: true },
    }),
    deps.prisma.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
  ]);

  const counts = new Map<LeadStage, number>();
  for (const group of grouped) {
    counts.set(group.stage, group._count._all);
  }

  const stages: PipelineDistributionItem[] = configs.map((config) => ({
    stage: config.stage,
    count: counts.get(config.stage) ?? 0,
  }));

  return { stages };
}
