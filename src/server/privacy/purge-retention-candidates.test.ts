import { describe, expect, it } from "vitest";

import { purgeRetentionCandidates } from "@/server/privacy/purge-retention-candidates";
import { buildErasureFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

function seedLostLead(store: PrivacyStore, organizationId: string, overrides: Partial<Parameters<PrivacyStore["addLead"]>[0]> = {}) {
  return store.addLead({
    organizationId,
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario@example.com",
    stage: "LOST",
    lossReasonId: "reason_1",
    stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

describe("purgeRetentionCandidates", () => {
  it("happy path: anonymizes every id passed in (reuses eraseLeadData)", async () => {
    const store = new PrivacyStore();
    const lead = seedLostLead(store, ORG_A);
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await purgeRetentionCandidates(deps, [lead.id]);

    expect(result).toEqual({ requested: 1, anonymized: 1, alreadyAnonymized: 0, failed: [] });
    const stored = store.lead(lead.id);
    expect(stored.anonymizedAt).not.toBeNull();
    expect(stored.firstName).toBe("Anonimizzato");
  });

  it("idempotent: an already-anonymized id is counted, not re-anonymized or errored", async () => {
    const store = new PrivacyStore();
    const lead = seedLostLead(store, ORG_A, {
      anonymizedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await purgeRetentionCandidates(deps, [lead.id]);

    expect(result).toEqual({ requested: 1, anonymized: 0, alreadyAnonymized: 1, failed: [] });
  });

  it("trusts the caller-provided id list: an id NOT among the original candidates is still anonymized if it exists in-tenant", async () => {
    const store = new PrivacyStore();
    // Not a retention candidate at all (still WON, no loss reason) — but the
    // use case does not re-run selection, it trusts the explicit id list.
    const notACandidate = store.addLead({
      organizationId: ORG_A,
      firstName: "Won",
      lastName: "Lead",
      stage: "WON",
      lossReasonId: null,
    });
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await purgeRetentionCandidates(deps, [notACandidate.id]);

    expect(result.anonymized).toBe(1);
    expect(store.lead(notACandidate.id).anonymizedAt).not.toBeNull();
  });

  it("isolation: an id from another tenant fails (recorded, not anonymized) and leaves that tenant's data untouched", async () => {
    const store = new PrivacyStore();
    const leadB = seedLostLead(store, ORG_B, { firstName: "Other", lastName: "Tenant" });
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await purgeRetentionCandidates(deps, [leadB.id]);

    expect(result).toEqual({ requested: 1, anonymized: 0, alreadyAnonymized: 0, failed: [leadB.id] });
    const stored = store.lead(leadB.id);
    expect(stored.anonymizedAt).toBeNull();
    expect(stored.firstName).toBe("Other");
  });

  it("partial failure: one bad id does not block the others in the same batch", async () => {
    const store = new PrivacyStore();
    const good = seedLostLead(store, ORG_A);
    const { deps } = buildErasureFake(store, ORG_A);

    const result = await purgeRetentionCandidates(deps, [good.id, "does_not_exist"]);

    expect(result.requested).toBe(2);
    expect(result.anonymized).toBe(1);
    expect(result.failed).toEqual(["does_not_exist"]);
    expect(store.lead(good.id).anonymizedAt).not.toBeNull();
  });

  it("writes ONE bulk retention.purge audit record summarizing the batch", async () => {
    const store = new PrivacyStore();
    const good = seedLostLead(store, ORG_A);
    const { deps, audits } = buildErasureFake(store, ORG_A, "actor_1");

    await purgeRetentionCandidates(deps, [good.id, "does_not_exist"]);

    // eraseLeadData writes its own per-lead audit too; the bulk record must be
    // the LAST one and be exactly one retention.purge entry.
    const purgeEvents = audits.filter((a) => a.action === "retention.purge");
    expect(purgeEvents).toHaveLength(1);
    const event = purgeEvents[0]!;
    expect(event.organizationId).toBe(ORG_A);
    expect(event.actorId).toBe("actor_1");
    const meta = event.meta as {
      requested: number;
      anonymized: number;
      alreadyAnonymized: number;
      failed: number;
      failedIds: string[];
    };
    expect(meta.requested).toBe(2);
    expect(meta.anonymized).toBe(1);
    expect(meta.failed).toBe(1);
    expect(meta.failedIds).toEqual(["does_not_exist"]);
  });

  it("empty id list: still writes a (zeroed) audit record, no-op result", async () => {
    const store = new PrivacyStore();
    const { deps, audits } = buildErasureFake(store, ORG_A);

    const result = await purgeRetentionCandidates(deps, []);

    expect(result).toEqual({ requested: 0, anonymized: 0, alreadyAnonymized: 0, failed: [] });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("retention.purge");
  });
});
