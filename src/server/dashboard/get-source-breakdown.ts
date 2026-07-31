import type { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import type { DashboardDeps } from "@/server/dashboard/deps";
import { dashboardFilterSchema, leadSourceFilter } from "@/server/dashboard/filters";
import { periodFilter } from "@/server/dashboard/period";

/**
 * "Provenienza lead" breakdown (docs/02 §2.2): the leads of the period grouped
 * by their SOURCE (`LeadSource`), with the same won/lost/conversion figures the
 * KPI tiles show — so a tenant can see WHICH channel actually converts, not just
 * which one brings volume.
 *
 * "Del periodo" uses the SAME anchor as the KPIs (`Lead.createdAt`) and the same
 * won/lost definition (the lead's CURRENT stage), so the per-source totals sum
 * exactly to the `totals` / `won` / `lost` KPIs. `convRate` mirrors the KPI
 * formula: won / total of the row, 0 when the row has no leads.
 *
 * Sources are tenant data, so labels come from the DB (never the i18n enum
 * layer). Leads with no source fall into a single `sourceId: null` bucket the UI
 * renders as a localized "Non specificato" — never silently dropped, otherwise
 * the breakdown would not reconcile with the KPI totals.
 *
 * Performance (docs/00 §3): no records loaded —
 *  - ONE `groupBy(sourceId, stage)` over the period's leads (the cardinality is
 *    sources × 11 stages, i.e. tiny), aggregated in memory, and
 *  - ONE `findMany` over the referenced `LeadSource` rows to map ids to labels
 *    (a single batched lookup, not per row → zero N+1).
 */

export interface SourceBreakdownItem {
  /** The lead source id, or null for leads with no source recorded. */
  readonly sourceId: string | null;
  /** The tenant's source label, or null when `sourceId` is null. */
  readonly label: string | null;
  /** Leads created in the period with this source. */
  readonly total: number;
  /** Of those, the ones currently in WON. */
  readonly won: number;
  /** Of those, the ones currently in LOST. */
  readonly lost: number;
  /** Conversion rate as a 0..1 ratio (won / total); 0 when total is 0. */
  readonly convRate: number;
}

export interface SourceBreakdownResult {
  readonly items: readonly SourceBreakdownItem[];
  /** Sum of every row's `total` — matches the `totals` KPI of the same period. */
  readonly total: number;
}

export async function getSourceBreakdown(
  deps: DashboardDeps,
  input: unknown,
): Promise<SourceBreakdownResult> {
  const filter = parseInput(dashboardFilterSchema, input);
  const range = periodFilter(filter);
  // The source filter applies here too: with a source selected the breakdown
  // collapses to that single row, so the block keeps reconciling with the KPI
  // tiles instead of contradicting them (the whole dashboard reads as ONE
  // filtered view — docs/02 §2.2).
  const where: Prisma.LeadWhereInput = {
    ...leadSourceFilter(filter),
    ...(range ? { createdAt: range } : {}),
  };

  const grouped = await deps.prisma.lead.groupBy({
    by: ["sourceId", "stage"],
    where,
    _count: { _all: true },
  });

  if (grouped.length === 0) {
    return { items: [], total: 0 };
  }

  // Fold the (source × stage) cells into one accumulator per source.
  const bySource = new Map<string | null, { total: number; won: number; lost: number }>();
  for (const group of grouped) {
    const key = group.sourceId ?? null;
    const acc = bySource.get(key) ?? { total: 0, won: 0, lost: 0 };
    const count = group._count._all;
    acc.total += count;
    if (group.stage === LeadStage.WON) acc.won += count;
    else if (group.stage === LeadStage.LOST) acc.lost += count;
    bySource.set(key, acc);
  }

  // Batch-resolve labels for the source ids actually referenced above (one query).
  const sourceIds = [...bySource.keys()].filter((id): id is string => id !== null);
  const sources =
    sourceIds.length === 0
      ? []
      : await deps.prisma.leadSource.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, label: true },
        });
  const labelById = new Map(sources.map((source) => [source.id, source.label]));

  const items: SourceBreakdownItem[] = [...bySource.entries()].map(([sourceId, acc]) => ({
    sourceId,
    label: sourceId === null ? null : (labelById.get(sourceId) ?? null),
    total: acc.total,
    won: acc.won,
    lost: acc.lost,
    convRate: acc.total === 0 ? 0 : acc.won / acc.total,
  }));

  // Highest volume first; stable tie-break by label for deterministic output.
  items.sort((a, b) => b.total - a.total || (a.label ?? "").localeCompare(b.label ?? ""));

  return { items, total: items.reduce((sum, item) => sum + item.total, 0) };
}
