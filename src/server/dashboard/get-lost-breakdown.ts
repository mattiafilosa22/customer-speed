import { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import type { DashboardDeps } from "@/server/dashboard/deps";
import { periodFilter, periodSchema } from "@/server/dashboard/period";

/**
 * "Vendite perse" breakdown (docs/02 §2.2/§2.5): LOST leads of the period grouped
 * by loss reason, with counts, most frequent first.
 *
 * "Del periodo" = LOST leads whose `createdAt` is in the period (same anchor as
 * the KPI `lost` count, so the totals reconcile: the sum of the breakdown counts
 * equals the `lost` KPI).
 *
 * Reasons are tenant-configurable (`LossReason`), so labels are resolved from the
 * DB (NOT the i18n enum layer). A LOST lead without a reason (`lossReasonId`
 * null) is bucketed as `reasonId: null` so the UI can show a localized
 * "Non specificato" — the count is never dropped.
 *
 * Performance (docs/00 §3): no records loaded —
 *  - ONE `groupBy(lossReasonId)` over LOST leads in the period, and
 *  - ONE `findMany` over the (small) referenced `LossReason` rows to map ids to
 *    labels (a single batched lookup, not per row → zero N+1).
 */

export interface LostBreakdownItem {
  /** The loss reason id, or null for LOST leads with no recorded reason. */
  readonly reasonId: string | null;
  /** The tenant's reason label, or null when `reasonId` is null. */
  readonly label: string | null;
  readonly count: number;
}

export interface LostBreakdownResult {
  readonly items: readonly LostBreakdownItem[];
}

export async function getLostBreakdown(
  deps: DashboardDeps,
  input: unknown,
): Promise<LostBreakdownResult> {
  const period = parseInput(periodSchema, input);
  const range = periodFilter(period);
  const where: Prisma.LeadWhereInput = {
    stage: LeadStage.LOST,
    ...(range ? { createdAt: range } : {}),
  };

  const grouped = await deps.prisma.lead.groupBy({
    by: ["lossReasonId"],
    where,
    _count: { _all: true },
  });

  if (grouped.length === 0) {
    return { items: [] };
  }

  // Batch-resolve labels for the non-null reason ids referenced above (one query).
  const reasonIds = grouped
    .map((group) => group.lossReasonId)
    .filter((id): id is string => id !== null);

  const reasons =
    reasonIds.length === 0
      ? []
      : await deps.prisma.lossReason.findMany({
          where: { id: { in: reasonIds } },
          select: { id: true, label: true },
        });
  const labelById = new Map(reasons.map((reason) => [reason.id, reason.label]));

  const items: LostBreakdownItem[] = grouped
    .map((group) => ({
      reasonId: group.lossReasonId,
      label: group.lossReasonId ? (labelById.get(group.lossReasonId) ?? null) : null,
      count: group._count._all,
    }))
    // Most frequent first; stable tie-break by label for deterministic output.
    .sort((a, b) => b.count - a.count || (a.label ?? "").localeCompare(b.label ?? ""));

  return { items };
}
