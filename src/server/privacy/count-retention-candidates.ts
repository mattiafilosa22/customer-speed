import { LeadStage } from "@/generated/prisma/enums";
import { monthsAgo } from "@/server/privacy/list-retention-candidates";
import { clockNow, type PrivacyDeps } from "@/server/privacy/deps";
import { resolveRetentionMonths } from "@/server/privacy/retention-months";

/**
 * Data retention — READ-ONLY preview count for the settings screen (docs/09,
 * `Organization.leadRetentionMonths`): "N lead verranno interessati dalla
 * prossima pulizia". Deliberately separate from `listRetentionCandidates`:
 * this returns ONLY a number, no lead identity, so it is safe to gate behind
 * the `settings.tenant` capability (a config-preview read) rather than
 * `lead.exportData` — nothing personal is exposed here.
 *
 * DB-aggregated (docs/00 §3: aggregates at the DB, never fetch-then-length):
 * uses `count()`, not `listRetentionCandidates(...).length`, so a tenant with
 * many aged LOST leads does not pay for transferring rows it will discard.
 * The WHERE clause mirrors `listRetentionCandidates` EXACTLY (same 5
 * conditions, same `monthsAgo` cutoff helper) — see that module's doc comment
 * for why each condition exists; this module is intentionally not the place
 * to re-derive that reasoning.
 */
export interface RetentionCandidatesCount {
  readonly count: number;
  /** The retention window actually used to compute `count` (resolved from the
   *  explicit override or the tenant's configured value); `null` means
   *  retention is not configured for this tenant (and `count` is 0). */
  readonly retentionMonths: number | null;
}

export async function countRetentionCandidates(
  deps: PrivacyDeps,
  explicitMonths?: number,
): Promise<RetentionCandidatesCount> {
  const retentionMonths = await resolveRetentionMonths(deps, explicitMonths);

  if (retentionMonths === null || !Number.isInteger(retentionMonths) || retentionMonths <= 0) {
    return { count: 0, retentionMonths };
  }

  const cutoff = monthsAgo(clockNow(deps), retentionMonths);

  const count = await deps.prisma.lead.count({
    where: {
      stage: LeadStage.LOST,
      OR: [{ lossReasonId: { not: null } }, { lossReasonCustomText: { not: null } }],
      stageChangedAt: { lte: cutoff },
      deletedAt: null,
      anonymizedAt: null,
    },
  });

  return { count, retentionMonths };
}
