import { LeadStage } from "@/generated/prisma/enums";
import { clockNow, type PrivacyDeps } from "@/server/privacy/deps";

/**
 * Data retention (docs/09, `Organization.leadRetentionMonths`): finds LOST
 * leads that are candidates for purge because they've sat in the LOST stage
 * (with a recorded loss reason) longer than the tenant's configured retention
 * window. This keeps the DB footprint bounded on the Supabase free tier
 * (500MB) without silently deleting anything — candidates must go through
 * `exportRetentionCandidates` (backup) before `purgeRetentionCandidates`.
 *
 * Selection criteria (all required):
 *  - `stage === LOST`
 *  - `lossReasonId` set (a LOST lead without a reason is NOT a candidate — it
 *    may still need triage/follow-up, so we never purge it automatically)
 *  - `stageChangedAt <= now - months` (aged past the retention window)
 *  - not already soft-deleted (`deletedAt: null`)
 *  - not already anonymized (`anonymizedAt: null`) — nothing left to purge
 *
 * Minimization (docs/06 §6.5): returns only what a "N lead candidati" preview
 * UI needs — no contact data. Use `exportRetentionCandidates` for the full
 * DSR-grade export before purge.
 *
 * Isolation: `deps.prisma` is the TENANT-SCOPED client, so every read is
 * forced to `organizationId` — this can never surface another tenant's leads.
 *
 * `months` is expected to be validated (positive integer) by the caller at
 * the Zod boundary (docs/00 §4: validation lives at the edge, not in the use
 * case). As defense in depth against a bulk-purge feature being fed a bad
 * value (e.g. a negative number would move the cutoff into the FUTURE and
 * match far more leads than intended), a non-positive-integer `months`
 * simply matches nothing rather than throwing.
 */

export interface RetentionCandidate {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly stageChangedAt: string; // ISO
}

/**
 * Upper bound on a single `listRetentionCandidates`/`exportRetentionCandidates`
 * batch, matching `purgeRetentionCandidatesSchema`'s max (`schemas.ts`) exactly
 * — a batch this call selects must always fit through the purge boundary that
 * consumes it, or the export→purge binding breaks for a tenant with more aged
 * LOST leads than the cap. Oldest-first `orderBy` means a capped batch always
 * clears the longest-overdue leads first; a tenant beyond the cap simply needs
 * more than one export→purge cycle.
 */
export const RETENTION_EXPORT_BATCH_CAP = 1000;

/**
 * `now` minus `months` calendar months, computed in UTC.
 *
 * Deliberately uses the UTC getters/`Date.UTC` rather than the local-time
 * `getMonth`/`setMonth`: those are timezone- AND DST-dependent, so the exact
 * SAME `now`/`months` pair can yield cutoffs up to an hour apart depending on
 * the host's local timezone (e.g. a DST transition between the current month
 * and the target month). For a retention/purge boundary that determines what
 * gets irreversibly anonymized, the cutoff must be a deterministic function of
 * the UTC instant, not of wherever the process happens to run.
 *
 * Exported so `countRetentionCandidates` (settings-screen preview count) can
 * apply the EXACT same cutoff without duplicating the UTC/DST reasoning above —
 * single source of truth for "what does N months mean" (docs/00 §1 DRY).
 */
export function monthsAgo(now: Date, months: number): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - months,
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

export async function listRetentionCandidates(
  deps: PrivacyDeps,
  months: number,
): Promise<RetentionCandidate[]> {
  if (!Number.isInteger(months) || months <= 0) {
    return [];
  }

  const cutoff = monthsAgo(clockNow(deps), months);

  const leads = await deps.prisma.lead.findMany({
    where: {
      stage: LeadStage.LOST,
      lossReasonId: { not: null },
      stageChangedAt: { lte: cutoff },
      deletedAt: null,
      anonymizedAt: null,
    },
    orderBy: { stageChangedAt: "asc" },
    take: RETENTION_EXPORT_BATCH_CAP,
    select: { id: true, firstName: true, lastName: true, stageChangedAt: true },
  });

  return leads.map((lead) => ({
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    stageChangedAt: lead.stageChangedAt.toISOString(),
  }));
}
