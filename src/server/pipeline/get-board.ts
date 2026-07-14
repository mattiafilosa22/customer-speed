import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { AppointmentStatus, type LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import { daysInStage } from "@/lib/days";
import type { PipelineDeps } from "@/server/pipeline/deps";
import { getPipelineConfig, type PipelineStageConfigItem } from "@/server/pipeline/get-pipeline-config";
import { nextAppointmentSelect, pipelineCardSelect } from "@/server/pipeline/selectors";

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
 *  - next appointment: ONE batched `findMany` over the lead ids of the fetched
 *    cards — NO query-per-card — keeping only the earliest future, non-cancelled
 *    appointment per lead (docs/02 §2.3).
 * Cards are bucketed into columns in memory; the day counter is computed from
 * `stageChangedAt` (no extra query). Columns are capped so a huge stage cannot
 * load thousands of rows into the board (deep browsing happens in "I miei lead").
 */

/** Hard cap on cards rendered per column (docs/00 §3 — never unbounded). */
export const MAX_CARDS_PER_COLUMN = 50;

/**
 * Board query filters, kept identical to the lead-list semantics (docs/02 §2.3):
 * the period (`year`/`month` on `createdAt`) and the lead source (`sourceId`).
 */
export const boardQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  sourceId: z.string().optional(),
});
export type BoardQueryInput = z.infer<typeof boardQuerySchema>;

export interface PipelineCard {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly stage: LeadStage;
  readonly daysInStage: number;
  readonly capitalBracket: PipelineCardRowCapital;
  /**
   * Exact capital amount (€) when set, else null. Serialized to a plain number
   * for the client (Decimal is not serializable across the RSC boundary); the
   * card shows the cifra when present, otherwise the bracket label.
   */
  readonly capitalAmount: number | null;
  readonly source: { id: string; label: string } | null;
  /**
   * Earliest future, non-cancelled appointment for the lead, if any (docs/02
   * §2.3). `startAt` is serialized to ISO (Date is not serializable across the
   * RSC boundary). Null when there is no such appointment.
   */
  readonly nextAppointment: { startAt: string; status: AppointmentStatus } | null;
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

  // The SAME `where` drives the cards scan AND the counts `groupBy`, so every
  // filter (period, source) is reflected consistently in both (docs/02 §2.3).
  const where: Prisma.LeadWhereInput = { stage: { in: visibleStages } };
  if (params.year) {
    where.createdAt = periodRange(params.year, params.month);
  }
  if (params.sourceId) {
    where.sourceId = params.sourceId;
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

  // First pass: bucket the RAW rows (respecting the per-column cap) so the
  // appointment lookup below is scoped to exactly the leads that end up on the
  // board — never the over-fetched, later-discarded tail of the window.
  const includedRows = new Map<LeadStage, typeof rows>();
  for (const stage of visibleStages) {
    includedRows.set(stage, []);
  }
  for (const row of rows) {
    const list = includedRows.get(row.stage);
    if (!list || list.length >= MAX_CARDS_PER_COLUMN) {
      continue;
    }
    list.push(row);
  }
  const visibleLeadIds = [...includedRows.values()].flatMap((list) => list.map((row) => row.id));

  // Second, batched query: the earliest future, non-cancelled appointment per
  // lead — ONE `findMany` for the whole board, never a query per card (docs/00
  // §3). Kept only when there is at least one lead to look up.
  const upcomingAppointments =
    visibleLeadIds.length > 0
      ? await deps.prisma.appointment.findMany({
          where: {
            leadId: { in: visibleLeadIds },
            startAt: { gte: now },
            status: { not: AppointmentStatus.CANCELED },
          },
          orderBy: { startAt: "asc" },
          select: nextAppointmentSelect,
        })
      : [];
  const nextAppointmentByLead = new Map<string, { startAt: string; status: AppointmentStatus }>();
  for (const appt of upcomingAppointments) {
    if (appt.leadId && !nextAppointmentByLead.has(appt.leadId)) {
      nextAppointmentByLead.set(appt.leadId, {
        startAt: appt.startAt.toISOString(),
        status: appt.status,
      });
    }
  }

  const buckets = new Map<LeadStage, PipelineCard[]>();
  for (const [stage, list] of includedRows) {
    buckets.set(
      stage,
      list.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        stage: row.stage,
        daysInStage: daysInStage(row.stageChangedAt, now),
        capitalBracket: row.capitalBracket,
        capitalAmount: row.capitalAmount === null ? null : row.capitalAmount.toNumber(),
        source: row.source,
        nextAppointment: nextAppointmentByLead.get(row.id) ?? null,
      })),
    );
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
