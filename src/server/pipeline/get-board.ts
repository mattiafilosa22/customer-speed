import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import { daysInStage } from "@/lib/days";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { getPipelineConfig, type PipelineStageConfigItem } from "@/server/pipeline/get-pipeline-config";
import { pipelineCardSelect } from "@/server/pipeline/selectors";

/**
 * Kanban board data (docs/02 §2.3).
 *
 * Composition: read the tenant pipeline config (visible columns, order, colour
 * tokens) and, for the VISIBLE stages only, the per-stage cards + counts.
 *
 * Performance (docs/00 §3): the whole board is built with a BOUNDED number of
 * queries regardless of the number of stages:
 *  - config: 2 queries (see `getPipelineConfig`),
 *  - cards: ONE `findMany` over all visible stages, capped at `MAX_CARDS_PER_COLUMN`
 *    per stage via a window over a single ordered scan — NO query-per-column,
 *  - counts: ONE `groupBy`.
 * Cards are bucketed into columns in memory; the day counter is computed from
 * `stageChangedAt` (no extra query). Columns are capped so a huge stage cannot
 * load thousands of rows into the board (deep browsing happens in "I miei lead").
 */

/** Hard cap on cards rendered per column (docs/00 §3 — never unbounded). */
export const MAX_CARDS_PER_COLUMN = 50;

/** Period filter, kept identical to the lead-list semantics (docs/02 §2.3). */
export const boardQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
export type BoardQueryInput = z.infer<typeof boardQuerySchema>;

export interface PipelineCard {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly stage: LeadStage;
  readonly daysInStage: number;
  readonly capitalBracket: PipelineCardRowCapital;
  readonly source: { id: string; label: string } | null;
}

type PipelineCardRowCapital =
  Prisma.LeadGetPayload<{ select: { capitalBracket: true } }>["capitalBracket"];

export interface PipelineColumn {
  readonly stage: LeadStage;
  readonly colorToken: string | null;
  readonly count: number;
  readonly cards: readonly PipelineCard[];
  /** True when `count` exceeds the cards actually returned (column is capped). */
  readonly hasMore: boolean;
}

export interface PipelineBoardResult {
  readonly columns: readonly PipelineColumn[];
}

/** Inclusive lower / exclusive upper UTC bounds for a year (+ optional month). */
function periodRange(year: number, month?: number): { gte: Date; lt: Date } {
  if (month) {
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function getBoard(deps: PipelineDeps, input: unknown): Promise<PipelineBoardResult> {
  const params = parseInput(boardQuerySchema, input);
  const now = new Date();

  const { stages } = await getPipelineConfig(deps);
  const visible: PipelineStageConfigItem[] = stages.filter((s) => s.isVisible);
  const visibleStages = visible.map((s) => s.stage);

  if (visibleStages.length === 0) {
    return { columns: [] };
  }

  const where: Prisma.LeadWhereInput = { stage: { in: visibleStages } };
  if (params.year) {
    where.createdAt = periodRange(params.year, params.month);
  }

  // One ordered scan (oldest `stageChangedAt` first → "most stuck" on top of each
  // column) + one aggregate. We over-fetch a bounded window and bucket in memory.
  const [rows, grouped] = await Promise.all([
    deps.prisma.lead.findMany({
      where,
      select: pipelineCardSelect,
      orderBy: { stageChangedAt: "asc" },
      take: visibleStages.length * MAX_CARDS_PER_COLUMN,
    }),
    deps.prisma.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
  ]);

  const counts = new Map<LeadStage, number>();
  for (const group of grouped) {
    counts.set(group.stage, group._count._all);
  }

  const buckets = new Map<LeadStage, PipelineCard[]>();
  for (const stage of visibleStages) {
    buckets.set(stage, []);
  }
  for (const row of rows) {
    const bucket = buckets.get(row.stage);
    if (!bucket || bucket.length >= MAX_CARDS_PER_COLUMN) {
      continue;
    }
    bucket.push({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      stage: row.stage,
      daysInStage: daysInStage(row.stageChangedAt, now),
      capitalBracket: row.capitalBracket,
      source: row.source,
    });
  }

  const columns: PipelineColumn[] = visible.map((cfg) => {
    const cards = buckets.get(cfg.stage) ?? [];
    const count = counts.get(cfg.stage) ?? 0;
    return {
      stage: cfg.stage,
      colorToken: cfg.colorToken,
      count,
      cards,
      hasMore: count > cards.length,
    };
  });

  return { columns };
}
