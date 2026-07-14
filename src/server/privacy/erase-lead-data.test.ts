import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { eraseLeadData } from "@/server/privacy/erase-lead-data";
import { buildErasureFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

function seed(): { store: PrivacyStore; leadAId: string } {
  const store = new PrivacyStore();
  const leadA = store.addLead({
    organizationId: ORG_A,
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario@example.com",
    phone: "+39111",
    adminNotes: "internal",
    lossReasonCustomText: "Preferisce un consulente vicino a Mario Rossi",
  });
  store.addNote({ organizationId: ORG_A, leadId: leadA.id, body: "n1" });
  store.addNote({ organizationId: ORG_A, leadId: leadA.id, body: "n2" });
  store.addRef({ organizationId: ORG_A, leadId: leadA.id });
  store.addAppt({ organizationId: ORG_A, leadId: leadA.id, reason: "Call con Mario Rossi" });
  store.addInvoice({ organizationId: ORG_A, leadId: leadA.id, number: "2026/001" });
  store.addStageHist({ organizationId: ORG_A, leadId: leadA.id, toStage: "WON" });

  const leadB = store.addLead({ organizationId: ORG_B, firstName: "Other", lastName: "B" });
  store.addNote({ organizationId: ORG_B, leadId: leadB.id, body: "B note" });

  return { store, leadAId: leadA.id };
}

describe("eraseLeadData", () => {
  it("happy path: anonymizes identity, hard-deletes free-text PII, keeps invoices", async () => {
    const { store, leadAId } = seed();
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await eraseLeadData(deps, leadAId);

    expect(result.alreadyAnonymized).toBe(false);
    expect(result.deleted.notes).toBe(2);
    expect(result.deleted.externalReferences).toBe(1);
    expect(result.anonymized.appointments).toBe(1);

    const lead = store.lead(leadAId);
    // Identity anonymized + marked erased.
    expect(lead.firstName).toBe("Anonimizzato");
    expect(lead.lastName).toBe("");
    expect(lead.email).toBeNull();
    expect(lead.phone).toBeNull();
    expect(lead.adminNotes).toBeNull();
    // Free-text custom loss reason may carry PII (e.g. name the person) — same
    // risk class as Note.body/Appointment.reason — must be cleared, not left
    // intact on an "anonymized" lead.
    expect(lead.lossReasonCustomText).toBeNull();
    expect(lead.anonymizedAt).not.toBeNull();
    expect(lead.deletedAt).not.toBeNull();

    // Notes + refs HARD-deleted.
    expect(store.notes.filter((n) => n.leadId === leadAId)).toHaveLength(0);
    expect(store.refs.filter((r) => r.leadId === leadAId)).toHaveLength(0);

    // Appointment free-text cleared, slot retained.
    const appt = store.appointments.find((a) => a.leadId === leadAId)!;
    expect(appt.reason).toBe("");
    expect(appt.startAt).toBeDefined();

    // Invoice retained (legal accounting retention).
    const inv = store.invoices.filter((i) => i.leadId === leadAId);
    expect(inv).toHaveLength(1);
    expect(inv[0]?.number).toBe("2026/001");

    // StageHistory retained (non-personal aggregate).
    expect(store.stageHistory.filter((s) => s.leadId === leadAId)).toHaveLength(1);
  });

  it("idempotent: a second call is a no-op (already anonymized)", async () => {
    const { store, leadAId } = seed();
    const { deps, audits } = buildErasureFake(store, ORG_A);

    await eraseLeadData(deps, leadAId);
    const second = await eraseLeadData(deps, leadAId);

    expect(second.alreadyAnonymized).toBe(true);
    expect(second.deleted.notes).toBe(0);
    // Both calls audited; second records the already-anonymized outcome.
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits[1]?.meta)).toContain("already-anonymized");
  });

  it("works on an ALREADY soft-deleted lead (erasure must still complete)", async () => {
    const store = new PrivacyStore();
    const lead = store.addLead({
      organizationId: ORG_A,
      firstName: "Soft",
      lastName: "Deleted",
      deletedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    store.addNote({ organizationId: ORG_A, leadId: lead.id, body: "x" });
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await eraseLeadData(deps, lead.id);
    expect(result.alreadyAnonymized).toBe(false);
    expect(store.lead(lead.id).anonymizedAt).not.toBeNull();
    expect(store.notes.filter((n) => n.leadId === lead.id)).toHaveLength(0);
  });

  it("isolation: cannot erase another tenant's lead (NotFound, no mutation)", async () => {
    const { store } = seed();
    const leadB = store.leads.find((l) => l.organizationId === ORG_B)!;
    const { deps } = buildErasureFake(store, ORG_A);

    await expect(eraseLeadData(deps, leadB.id)).rejects.toBeInstanceOf(NotFoundError);
    // B's data untouched.
    expect(store.lead(leadB.id).firstName).toBe("Other");
    expect(store.notes.filter((n) => n.leadId === leadB.id)).toHaveLength(1);
  });

  it("writes an audit record documenting the erasure + retention decision", async () => {
    const { store, leadAId } = seed();
    const { deps, audits } = buildErasureFake(store, ORG_A, "actor_9");
    await eraseLeadData(deps, leadAId);

    expect(audits).toHaveLength(1);
    const event = audits[0]!;
    expect(event.action).toBe("gdpr.erasure");
    expect(event.organizationId).toBe(ORG_A);
    expect(event.actorId).toBe("actor_9");
    expect(event.entityId).toBe(leadAId);
    const meta = JSON.stringify(event.meta);
    expect(meta).toContain("anonymized");
    expect(meta).toContain("legal-accounting-retention");
    // No PII in the audit trail.
    expect(meta).not.toContain("Preferisce un consulente vicino a Mario Rossi");
    expect(meta).not.toContain("mario@example.com");
  });

  it("missing lead → NotFound", async () => {
    const { store } = seed();
    const { deps } = buildErasureFake(store, ORG_A);
    await expect(eraseLeadData(deps, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
