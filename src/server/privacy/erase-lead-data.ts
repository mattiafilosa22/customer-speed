import { NotFoundError } from "@/lib/errors";
import { clockNow, type PrivacyDeps } from "@/server/privacy/deps";

/**
 * GDPR ERASURE for a lead — true right-to-be-forgotten (art. 17, docs/06 §6.5,
 * docs/09 §9.6). Goes BEYOND the soft-delete (which only hides the row): it
 * irreversibly removes / anonymizes the data subject's personal data while
 * honouring competing obligations (accounting retention of invoices).
 *
 * ── What is DELETED vs ANONYMIZED (and why) ─────────────────────────────────
 *  - Notes (free-text, may contain rich PII)            → HARD DELETE.
 *  - External CRM references (altName/altEmail are PII) → HARD DELETE.
 *  - Appointment.reason (free text, may name the person) → ANONYMIZED (cleared);
 *    the slot's timing/status is kept for operational/aggregate integrity.
 *  - Lead identity (firstName/lastName/email/phone/adminNotes) → ANONYMIZED
 *    (overwritten with neutral placeholders / null), and the row is marked
 *    `anonymizedAt` (+ `deletedAt` so it stays hidden everywhere).
 *  - Invoices → KEPT AS-IS. Amounts/dates are required for tax/accounting
 *    retention (a legal obligation that overrides erasure under GDPR art. 17(3)).
 *    They carry NO personal data of their own beyond the link to the lead, and
 *    that link now points at an ANONYMIZED lead, so the personal connection is
 *    severed while the legally-required figures survive.
 *  - StageHistory → KEPT. Only stages + timestamps (no PII); needed for funnel
 *    aggregates / audit integrity.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * The tenant-scoped client forces `organizationId` on every statement, so a
 * lead id from another tenant resolves to nothing → `NotFoundError`. A tenant
 * can never erase another tenant's data. The caller wires this client with
 * `includeSoftDeleted: true` so an already soft-deleted lead can still be erased.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Safe to call repeatedly: once `anonymizedAt` is set the use case short-circuits
 * to a no-op result (still audited as `already-anonymized`). Deletes of notes /
 * refs use `deleteMany` (no-op when empty), so a partial retry converges.
 */

export interface EraseLeadResult {
  readonly id: string;
  readonly alreadyAnonymized: boolean;
  readonly deleted: {
    readonly notes: number;
    readonly externalReferences: number;
  };
  readonly anonymized: {
    readonly appointments: number;
  };
}

/** Neutral placeholders written over the subject's identity. */
const ANON_FIRST_NAME = "Anonimizzato";
const ANON_LAST_NAME = "";

export async function eraseLeadData(
  deps: PrivacyDeps,
  leadId: string,
): Promise<EraseLeadResult> {
  // Ownership + current state. `includeSoftDeleted` must be set on the client so
  // a soft-deleted lead is still visible to the erasure flow.
  const lead = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, anonymizedAt: true },
  });
  if (!lead) {
    throw new NotFoundError("Lead not found");
  }

  // Idempotent: already erased → no-op (still leave an audit trail of the call).
  if (lead.anonymizedAt) {
    await deps.audit.record({
      action: "gdpr.erasure",
      organizationId: deps.actor.organizationId,
      actorId: deps.actor.userId,
      entity: "Lead",
      entityId: lead.id,
      meta: { subject: "lead", outcome: "already-anonymized" },
    });
    return {
      id: lead.id,
      alreadyAnonymized: true,
      deleted: { notes: 0, externalReferences: 0 },
      anonymized: { appointments: 0 },
    };
  }

  const now = clockNow(deps);

  // Run the whole erasure ATOMICALLY: either all personal data is removed/
  // anonymized, or nothing is — a mid-sequence crash must not leave a
  // half-erased subject. The steps remain individually idempotent (deleteMany is
  // a no-op when empty; the lead only gets `anonymizedAt` on the final step), so
  // a retry after an aborted transaction still converges.
  const [deletedNotes, deletedRefs, anonAppointments] = await deps.prisma.$transaction(
    async (tx) => {
      // Hard-delete free-text PII relations.
      const notes = await tx.note.deleteMany({ where: { leadId } });
      const refs = await tx.externalCrmRef.deleteMany({ where: { leadId } });
      // Anonymize appointment free-text (keep timing/status for aggregates).
      const appts = await tx.appointment.updateMany({
        where: { leadId },
        data: { reason: ANON_LAST_NAME }, // "" — neutral, no PII
      });
      // Anonymize the lead identity and mark it erased. We do NOT touch invoices
      // (legal retention) nor stageHistory (no PII). Setting `deletedAt` keeps it
      // hidden from every default-filtered read.
      await tx.lead.update({
        where: { id: leadId },
        data: {
          firstName: ANON_FIRST_NAME,
          lastName: ANON_LAST_NAME,
          email: null,
          phone: null,
          adminNotes: null,
          anonymizedAt: now,
          deletedAt: now,
        },
      });
      return [notes, refs, appts] as const;
    },
  );

  await deps.audit.record({
    action: "gdpr.erasure",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: lead.id,
    meta: {
      subject: "lead",
      outcome: "anonymized",
      deleted: { notes: deletedNotes.count, externalReferences: deletedRefs.count },
      anonymized: { appointments: anonAppointments.count },
      // Document the retention decision in the trail itself.
      retained: { invoices: "legal-accounting-retention", stageHistory: "non-personal" },
    },
  });

  return {
    id: lead.id,
    alreadyAnonymized: false,
    deleted: { notes: deletedNotes.count, externalReferences: deletedRefs.count },
    anonymized: { appointments: anonAppointments.count },
  };
}
