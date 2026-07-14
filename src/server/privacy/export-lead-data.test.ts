import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { exportLeadData } from "@/server/privacy/export-lead-data";
import { buildExportFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

function seed(): { store: PrivacyStore; leadAId: string } {
  const store = new PrivacyStore();
  const src = store.addSource({ organizationId: ORG_A, label: "Instagram" });
  const leadA = store.addLead({
    organizationId: ORG_A,
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario@example.com",
    phone: "+39111",
    sourceId: src.id,
    adminNotes: "VIP",
  });
  store.addNote({ organizationId: ORG_A, leadId: leadA.id, body: "Prima nota" });
  store.addNote({ organizationId: ORG_A, leadId: leadA.id, body: "Seconda nota" });
  store.addRef({ organizationId: ORG_A, leadId: leadA.id, altName: "M. Rossi" });
  store.addAppt({ organizationId: ORG_A, leadId: leadA.id, reason: "Call iniziale" });
  store.addInvoice({ organizationId: ORG_A, leadId: leadA.id });
  store.addStageHist({ organizationId: ORG_A, leadId: leadA.id, toStage: "WON" });

  // Another tenant's lead with the SAME-looking data (isolation control).
  const leadB = store.addLead({ organizationId: ORG_B, firstName: "Other", lastName: "Tenant" });
  store.addNote({ organizationId: ORG_B, leadId: leadB.id, body: "B note (must never appear)" });

  return { store, leadAId: leadA.id };
}

/** A LOST lead with a predefined `lossReasonId` (resolved to its label). */
function seedWithPredefinedLossReason(): { store: PrivacyStore; leadId: string } {
  const store = new PrivacyStore();
  const reason = store.addLossReason({ organizationId: ORG_A, label: "Non ha più risposto" });
  const lead = store.addLead({
    organizationId: ORG_A,
    firstName: "Luca",
    lastName: "Bianchi",
    lossReasonId: reason.id,
  });
  return { store, leadId: lead.id };
}

/** A LOST lead with only a free-text `lossReasonCustomText` ("Altro"). */
function seedWithCustomLossReason(): { store: PrivacyStore; leadId: string } {
  const store = new PrivacyStore();
  const lead = store.addLead({
    organizationId: ORG_A,
    firstName: "Giulia",
    lastName: "Verdi",
    lossReasonCustomText: "Preferisce un altro consulente",
  });
  return { store, leadId: lead.id };
}

describe("exportLeadData", () => {
  it("happy path: returns all the subject's personal data, structured", async () => {
    const { store, leadAId } = seed();
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportLeadData(deps, leadAId);

    expect(result.format).toBe("customerspeed.lead-export.v1");
    expect(result.subject).toEqual({ kind: "lead", id: leadAId });
    expect(result.lead.firstName).toBe("Mario");
    expect(result.lead.email).toBe("mario@example.com");
    expect(result.lead.source).toBe("Instagram");
    expect(result.lead.adminNotes).toBe("VIP");
    expect(result.notes.map((n) => n.body)).toEqual(["Prima nota", "Seconda nota"]);
    expect(result.appointments).toHaveLength(1);
    expect(result.invoices).toHaveLength(1);
    // Decimal serialized as string (precision preserved, never float).
    expect(result.invoices[0]?.netAmount).toBe("1000");
    expect(result.externalReferences).toHaveLength(1);
    expect(result.stageHistory).toHaveLength(1);
  });

  it("includes the loss reason label when lossReasonId is set (predefined reason)", async () => {
    const { store, leadId } = seedWithPredefinedLossReason();
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportLeadData(deps, leadId);

    expect(result.lead.lossReason).toBe("Non ha più risposto");
  });

  it("includes the free-text custom loss reason when only lossReasonCustomText is set ('Altro')", async () => {
    const { store, leadId } = seedWithCustomLossReason();
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportLeadData(deps, leadId);

    expect(result.lead.lossReason).toBe("Preferisce un altro consulente");
  });

  it("minimization: never includes another tenant's data", async () => {
    const { store, leadAId } = seed();
    const { deps } = buildExportFake(store, ORG_A);
    const result = await exportLeadData(deps, leadAId);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("B note");
    expect(serialized).not.toContain("Other");
  });

  it("isolation: a lead from another tenant is NotFound (non-revealing)", async () => {
    const { store } = seed();
    const leadB = store.leads.find((l) => l.organizationId === ORG_B);
    const { deps } = buildExportFake(store, ORG_A);
    await expect(exportLeadData(deps, leadB!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes an audit record (proof) WITHOUT leaking PII (only counts)", async () => {
    const { store, leadAId } = seed();
    const { deps, audits } = buildExportFake(store, ORG_A, "actor_1");
    await exportLeadData(deps, leadAId);

    expect(audits).toHaveLength(1);
    const event = audits[0]!;
    expect(event.action).toBe("gdpr.export");
    expect(event.organizationId).toBe(ORG_A);
    expect(event.actorId).toBe("actor_1");
    expect(event.entity).toBe("Lead");
    expect(event.entityId).toBe(leadAId);
    // The audit meta carries counts, not the personal data itself.
    const meta = JSON.stringify(event.meta);
    expect(meta).toContain("counts");
    expect(meta).not.toContain("mario@example.com");
  });

  it("missing lead → NotFound", async () => {
    const { store } = seed();
    const { deps } = buildExportFake(store, ORG_A);
    await expect(exportLeadData(deps, "does_not_exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});
