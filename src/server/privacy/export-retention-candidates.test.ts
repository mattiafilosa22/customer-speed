import { describe, expect, it } from "vitest";

import { exportRetentionCandidates } from "@/server/privacy/export-retention-candidates";
import { buildExportFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

function seedCandidate(store: PrivacyStore, organizationId: string) {
  const lead = store.addLead({
    organizationId,
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario@example.com",
    stage: "LOST",
    lossReasonId: "reason_1",
    stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
  });
  store.addNote({ organizationId, leadId: lead.id, body: "Nota persa" });
  return lead;
}

describe("exportRetentionCandidates", () => {
  it("happy path: exports full DSR-grade data for every candidate", async () => {
    const store = new PrivacyStore();
    const lead = seedCandidate(store, ORG_A);
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportRetentionCandidates(deps, 6);

    expect(result.format).toBe("customerspeed.retention-export.v1");
    expect(result.criteria).toEqual({ stage: "LOST", retentionMonths: 6 });
    expect(result.count).toBe(1);
    expect(result.leads).toHaveLength(1);
    // Reuses collectLeadDataForExport — same shape as the single-lead export.
    expect(result.leads[0]?.format).toBe("customerspeed.lead-export.v1");
    expect(result.leads[0]?.subject.id).toBe(lead.id);
    expect(result.leads[0]?.lead.firstName).toBe("Mario");
    expect(result.leads[0]?.notes.map((n) => n.body)).toEqual(["Nota persa"]);
  });

  it("no candidates: returns an empty (not erroring) export", async () => {
    const store = new PrivacyStore();
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportRetentionCandidates(deps, 6);

    expect(result.count).toBe(0);
    expect(result.leads).toEqual([]);
  });

  it("isolation: never includes another tenant's candidate", async () => {
    const store = new PrivacyStore();
    const leadA = seedCandidate(store, ORG_A);
    const leadB = seedCandidate(store, ORG_B);
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportRetentionCandidates(deps, 6);

    expect(result.count).toBe(1);
    expect(result.leads.map((l) => l.subject.id)).toEqual([leadA.id]);
    expect(result.leads.map((l) => l.subject.id)).not.toContain(leadB.id);
  });

  it("writes ONE bulk audit record (not one per lead) binding export→purge via leadIds", async () => {
    const store = new PrivacyStore();
    const leadA = seedCandidate(store, ORG_A);
    const leadA2 = store.addLead({
      organizationId: ORG_A,
      firstName: "Second",
      lastName: "Candidate",
      stage: "LOST",
      lossReasonId: "reason_2",
      stageChangedAt: new Date("2025-02-01T00:00:00.000Z"),
    });
    const { deps, audits } = buildExportFake(store, ORG_A, "actor_1");

    await exportRetentionCandidates(deps, 6);

    expect(audits).toHaveLength(1);
    const event = audits[0]!;
    expect(event.action).toBe("retention.export");
    expect(event.organizationId).toBe(ORG_A);
    expect(event.actorId).toBe("actor_1");
    const meta = event.meta as { count: number; retentionMonths: number; leadIds: string[] };
    expect(meta.count).toBe(2);
    expect(meta.retentionMonths).toBe(6);
    expect(meta.leadIds.sort()).toEqual([leadA.id, leadA2.id].sort());
    // No PII in the audit trail.
    expect(JSON.stringify(event.meta)).not.toContain("mario@example.com");
  });

  it("writes the (empty) bulk audit record even when there are zero candidates", async () => {
    const store = new PrivacyStore();
    const { deps, audits } = buildExportFake(store, ORG_A);

    await exportRetentionCandidates(deps, 6);

    expect(audits).toHaveLength(1);
    const meta = audits[0]?.meta as { count: number; leadIds: string[] };
    expect(meta.count).toBe(0);
    expect(meta.leadIds).toEqual([]);
  });
});
