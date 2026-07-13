import { eraseLeadData } from "@/server/privacy/erase-lead-data";
import type { PrivacyDeps } from "@/server/privacy/deps";

/**
 * Data retention — BULK PURGE (anonymization) of leads (docs/09,
 * `Organization.leadRetentionMonths`).
 *
 * ── Export→purge binding (security) ─────────────────────────────────────────
 * This use case deliberately does NOT re-run the candidate query. It only
 * anonymizes the EXACT `leadIds` the caller passes in. The caller (route
 * handler / Server Action) is responsible for passing exactly the
 * `leads[].subject.id` list it just received from `exportRetentionCandidates`
 * in the SAME user interaction — that binding is what guarantees a lead is
 * never purged without first having been downloaded as a backup. This use
 * case does still enforce tenant isolation itself (below); it does NOT
 * independently verify the id list was actually exported — that
 * responsibility sits one layer up, by design (see task/module docs).
 *
 * Reuses `eraseLeadData` per lead — the anonymization logic (what's deleted vs
 * anonymized vs retained) has exactly one implementation (docs/00 §1 DRY).
 * Idempotent: an id that's already anonymized is a no-op inside `eraseLeadData`.
 *
 * ── Isolation ────────────────────────────────────────────────────────────────
 * `deps.prisma` is the TENANT-SCOPED client, so `eraseLeadData` can only ever
 * touch leads in `deps.actor.organizationId` — an id for another tenant simply
 * resolves to `NotFoundError` inside `eraseLeadData`, which this use case
 * records as a failure for that id (never a cross-tenant mutation).
 *
 * ── Partial failure ──────────────────────────────────────────────────────────
 * Each `eraseLeadData` call is already atomic (its own transaction); there is
 * no meaningful cross-lead transaction to wrap them in. A failure on one id
 * (e.g. not found) must not block the others, so failures are accumulated
 * rather than thrown. Sequential (not `Promise.all`/`allSettled`): the tenant
 * Prisma pool is capped per instance (`DATABASE_POOL_MAX`, see
 * src/lib/prisma.ts / commit ba177cd) — firing N concurrent erasures for a
 * bulk purge would risk exhausting it.
 *
 * Audit: ONE `retention.purge` record for the whole batch (not one per lead —
 * `eraseLeadData` already writes its own per-lead `gdpr.erasure` record, so the
 * per-lead trail exists; this one is the bulk-operation-level proof).
 */

export interface RetentionPurgeResult {
  readonly requested: number;
  readonly anonymized: number;
  readonly alreadyAnonymized: number;
  readonly failed: readonly string[];
}

export async function purgeRetentionCandidates(
  deps: PrivacyDeps,
  leadIds: readonly string[],
): Promise<RetentionPurgeResult> {
  let anonymized = 0;
  let alreadyAnonymized = 0;
  const failed: string[] = [];

  for (const leadId of leadIds) {
    try {
      const result = await eraseLeadData(deps, leadId);
      if (result.alreadyAnonymized) {
        alreadyAnonymized += 1;
      } else {
        anonymized += 1;
      }
    } catch {
      // Independent operations: one failure (e.g. not found / foreign tenant)
      // must not block the rest of the batch.
      failed.push(leadId);
    }
  }

  await deps.audit.record({
    action: "retention.purge",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: null,
    meta: {
      requested: leadIds.length,
      anonymized,
      alreadyAnonymized,
      failed: failed.length,
      failedIds: failed,
    },
  });

  return { requested: leadIds.length, anonymized, alreadyAnonymized, failed };
}
