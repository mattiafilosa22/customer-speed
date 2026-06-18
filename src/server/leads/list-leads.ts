import { Prisma } from "@/generated/prisma/client";
import type { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import { clockNow, type LeadDeps } from "@/server/leads/deps";
import { listLeadsSchema, type ListLeadsInput } from "@/server/leads/schemas";
import { leadListSelect, type LeadListRow } from "@/server/leads/selectors";
import { daysInStage } from "@/lib/days";

/**
 * "I miei lead" list (docs/02 §2.4, docs/04 §4.3 GET /leads).
 *
 * Performance (docs/00 §3 — zero N+1, aggregates DB-side, paginated):
 *  - ONE `findMany` (page rows, with source + note-count batched in the select),
 *  - ONE `count` for the active filter's total (pagination),
 *  - ONE `groupBy` for the per-stage tab counts (period-scoped, NOT stage-scoped)
 *    + ONE `count` for the "Tutti" tab.
 *  No per-row queries; the day count is computed in memory from `stageChangedAt`.
 *
 * "Giorni" ordering: days = now − stageChangedAt, so the OLDEST `stageChangedAt`
 * has the MOST days. Therefore `days_desc` (most stuck first) ⇒
 * `stageChangedAt asc`, and `days_asc` ⇒ `stageChangedAt desc`. The `minDays`
 * filter becomes `stageChangedAt <= now − minDays`. All ordering/filtering is
 * pushed to indexed columns (`[organizationId, stageChangedAt]`,
 * `[organizationId, createdAt]`).
 */

export interface LeadListItem {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly stage: LeadStage;
  readonly daysInStage: number;
  readonly capitalBracket: LeadListRow["capitalBracket"];
  readonly source: { id: string; label: string } | null;
  readonly noteCount: number;
}

export interface LeadListResult {
  readonly data: readonly LeadListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Tab counts: "all" + one per stage present in the period (docs/02 §2.4). */
  readonly stageCounts: { readonly all: number } & Partial<Record<LeadStage, number>>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inclusive lower / exclusive upper UTC bounds for a year (+ optional month). */
function periodRange(year: number, month?: number): { gte: Date; lt: Date } {
  if (month) {
    const gte = new Date(Date.UTC(year, month - 1, 1));
    const lt = new Date(Date.UTC(year, month, 1));
    return { gte, lt };
  }
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/**
 * Build the `where` shared by the list query, the total count and the tab
 * counts. `includeStage` is false for the tab-count query (counts span all
 * stages of the period) and true for the page/total (the active tab filter).
 */
function buildWhere(
  input: ListLeadsInput,
  now: Date,
  includeStage: boolean,
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

  if (input.query) {
    where.OR = [
      { firstName: { contains: input.query, mode: "insensitive" } },
      { lastName: { contains: input.query, mode: "insensitive" } },
      { email: { contains: input.query, mode: "insensitive" } },
      { phone: { contains: input.query, mode: "insensitive" } },
    ];
  }
  if (input.sourceId) {
    where.sourceId = input.sourceId;
  }
  if (input.year) {
    where.createdAt = periodRange(input.year, input.month);
  }
  if (input.minDays !== undefined) {
    // days >= minDays ⇔ stageChangedAt <= now − minDays
    where.stageChangedAt = { lte: new Date(now.getTime() - input.minDays * MS_PER_DAY) };
  }
  if (includeStage && input.stage) {
    where.stage = input.stage;
  }
  return where;
}

function orderBy(sort: ListLeadsInput["sort"]): Prisma.LeadOrderByWithRelationInput {
  switch (sort) {
    case "days_desc": // most days in stage first → oldest stageChangedAt first
      return { stageChangedAt: "asc" };
    case "days_asc": // fewest days first → newest stageChangedAt first
      return { stageChangedAt: "desc" };
    default: // newest leads first
      return { createdAt: "desc" };
  }
}

export async function listLeads(deps: LeadDeps, input: unknown): Promise<LeadListResult> {
  const params = parseInput(listLeadsSchema, input);
  const now = clockNow(deps);

  const pageWhere = buildWhere(params, now, true);
  const countWhere = buildWhere(params, now, false);
  const skip = (params.page - 1) * params.pageSize;

  // Run the page query, the active-tab total and the tab counts concurrently —
  // all tenant-scoped + soft-delete-filtered by the extension.
  const [rows, total, grouped, all] = await Promise.all([
    deps.prisma.lead.findMany({
      where: pageWhere,
      select: leadListSelect,
      orderBy: orderBy(params.sort),
      skip,
      take: params.pageSize,
    }),
    deps.prisma.lead.count({ where: pageWhere }),
    deps.prisma.lead.groupBy({
      by: ["stage"],
      where: countWhere,
      _count: { _all: true },
    }),
    deps.prisma.lead.count({ where: countWhere }),
  ]);

  const stageCounts: { all: number } & Partial<Record<LeadStage, number>> = { all };
  for (const group of grouped) {
    stageCounts[group.stage] = group._count._all;
  }

  const data: LeadListItem[] = rows.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    stage: row.stage,
    daysInStage: daysInStage(row.stageChangedAt, now),
    capitalBracket: row.capitalBracket,
    source: row.source,
    noteCount: row._count.notes,
  }));

  return { data, total, page: params.page, pageSize: params.pageSize, stageCounts };
}
