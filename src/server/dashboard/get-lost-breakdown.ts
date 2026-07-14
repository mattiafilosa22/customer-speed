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
 * DB (NOT the i18n enum layer). `lossReasonId` and `lossReasonCustomText` ("Altro")
 * are mutually exclusive (`changeStageSchema`), so a LOST lead without a
 * `lossReasonId` falls into ONE of two distinct buckets — never conflated, so the
 * dashboard never mislabels a documented custom reason as "not specified"
 * (same split as `count-retention-candidates`/`list-retention-candidates`):
 *  - `reasonId: null, isCustom: true` — a free-text reason WAS recorded ("Altro"),
 *    the UI renders a localized "Altro".
 *  - `reasonId: null, isCustom: false` — genuinely no reason was recorded (legacy
 *    leads predating this feature), the UI renders a localized "Non specificato".
 *
 * Performance (docs/00 §3): no records loaded —
 *  - ONE `groupBy(lossReasonId)` over LOST leads in the period,
 *  - ONE `count` to size the "Altro" slice of the null-`lossReasonId` bucket, and
 *  - ONE `findMany` over the (small) referenced `LossReason` rows to map ids to
 *    labels (a single batched lookup, not per row → zero N+1).
 */

export interface LostBreakdownItem {
  /** The loss reason id, or null for LOST leads with no matched tenant reason. */
  readonly reasonId: string | null;
  /** The tenant's reason label, or null when `reasonId` is null. */
  readonly label: string | null;
  /** True for the "Altro" bucket: no `reasonId`, but a free-text reason was recorded. */
  readonly isCustom: boolean;
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

  const [grouped, customCount] = await Promise.all([
    deps.prisma.lead.groupBy({
      by: ["lossReasonId"],
      where,
      _count: { _all: true },
    }),
    // Size of the "Altro" slice within the null-`lossReasonId` bucket below.
    deps.prisma.lead.count({
      where: { ...where, lossReasonId: null, lossReasonCustomText: { not: null } },
    }),
  ]);

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

  const items: LostBreakdownItem[] = [];
  for (const group of grouped) {
    if (group.lossReasonId !== null) {
      items.push({
        reasonId: group.lossReasonId,
        label: labelById.get(group.lossReasonId) ?? null,
        isCustom: false,
        count: group._count._all,
      });
      continue;
    }
    // Null-`lossReasonId` bucket: split into "Altro" (custom text recorded) vs
    // "Non specificato" (neither recorded — legacy leads only).
    const unspecifiedCount = group._count._all - customCount;
    if (customCount > 0) {
      items.push({ reasonId: null, label: null, isCustom: true, count: customCount });
    }
    if (unspecifiedCount > 0) {
      items.push({ reasonId: null, label: null, isCustom: false, count: unspecifiedCount });
    }
  }

  // Most frequent first; stable tie-break by label for deterministic output.
  items.sort((a, b) => b.count - a.count || (a.label ?? "").localeCompare(b.label ?? ""));

  return { items };
}
