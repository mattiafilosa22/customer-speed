import { collectLeadDataForExport, type LeadDataExport } from "@/server/privacy/export-lead-data";
import { listRetentionCandidates } from "@/server/privacy/list-retention-candidates";
import { clockNow, type PrivacyDeps } from "@/server/privacy/deps";

/**
 * Data retention — BULK BACKUP EXPORT of the current retention candidates
 * (docs/09, `Organization.leadRetentionMonths`), taken immediately before an
 * operator triggers `purgeRetentionCandidates`. This is the mandatory backup
 * step of the export→purge binding: the route handler MUST pass the exact
 * `leads[].subject.id` list returned here (in the SAME user interaction) into
 * the purge call, so a lead can never be anonymized without first having been
 * downloaded (see `purge-retention-candidates.ts`).
 *
 * Reuses `listRetentionCandidates` for selection and `collectLeadDataForExport`
 * per lead for the actual DSR-grade personal-data collection — the selection
 * query and the export/minimization logic each have exactly one implementation
 * (docs/00 §1 DRY).
 *
 * Sequential, not parallel (`Promise.all`): the tenant Prisma pool is capped
 * per instance (`DATABASE_POOL_MAX`, see src/lib/prisma.ts / commit ba177cd) —
 * firing N concurrent per-lead queries for a bulk export would risk exhausting
 * it. A sequential loop keeps this safe regardless of candidate count.
 *
 * Audit: ONE `retention.export` record for the whole batch (not one per lead,
 * which would spam the trail) carrying counts + the exact `leadIds` exported —
 * this is what the subsequent `retention.purge` record's binding refers back to.
 *
 * Batch size: `listRetentionCandidates` caps at `RETENTION_EXPORT_BATCH_CAP`
 * (oldest-first), matching `purgeRetentionCandidatesSchema`'s max so this
 * export's `leadIds` always fit through the purge boundary that consumes them.
 * A tenant with more aged candidates than the cap needs multiple export→purge
 * cycles — `count` here reflects the CAPPED batch, not the tenant's full total
 * (use `countRetentionCandidates` for the uncapped preview count).
 */

export interface RetentionBulkExport {
  readonly format: "customerspeed.retention-export.v1";
  readonly exportedAt: string; // ISO
  readonly criteria: {
    readonly stage: "LOST";
    readonly retentionMonths: number;
  };
  readonly count: number;
  readonly leads: readonly LeadDataExport[];
}

export async function exportRetentionCandidates(
  deps: PrivacyDeps,
  months: number,
): Promise<RetentionBulkExport> {
  const candidates = await listRetentionCandidates(deps, months);

  const leads: LeadDataExport[] = [];
  for (const candidate of candidates) {
    leads.push(await collectLeadDataForExport(deps, candidate.id));
  }

  const exportedAt = clockNow(deps).toISOString();

  // Single batched audit record (not one per lead) — proof of the export
  // WITHOUT leaking PII, and the leadIds that bind this export to the purge.
  await deps.audit.record({
    action: "retention.export",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: null,
    meta: {
      count: leads.length,
      retentionMonths: months,
      leadIds: leads.map((lead) => lead.subject.id),
    },
  });

  return {
    format: "customerspeed.retention-export.v1",
    exportedAt,
    criteria: { stage: "LOST", retentionMonths: months },
    count: leads.length,
    leads,
  };
}
