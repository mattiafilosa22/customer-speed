import { describe, expect, it } from "vitest";

import { countRetentionCandidates } from "@/server/privacy/count-retention-candidates";
import { buildExportFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const NOW = new Date("2026-06-19T12:00:00.000Z");

function seedCandidate(store: PrivacyStore, organizationId: string, stageChangedAt: string) {
  return store.addLead({
    organizationId,
    stage: "LOST",
    lossReasonId: "reason_1",
    stageChangedAt: new Date(stageChangedAt),
  });
}

describe("countRetentionCandidates", () => {
  it("happy path: counts candidates using the tenant's configured retentionMonths", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 6 });
    seedCandidate(store, ORG_A, "2025-01-01T00:00:00.000Z"); // aged past 6 months
    seedCandidate(store, ORG_A, "2026-06-01T00:00:00.000Z"); // too recent
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await countRetentionCandidates(deps);

    expect(result).toEqual({ count: 1, retentionMonths: 6 });
  });

  it("an explicit months override wins over the tenant's configured value", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 24 });
    seedCandidate(store, ORG_A, "2025-01-01T00:00:00.000Z"); // aged past 6, not 24
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await countRetentionCandidates(deps, 6);

    expect(result).toEqual({ count: 1, retentionMonths: 6 });
  });

  it("retention not configured: returns zero, not an error", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: null });
    seedCandidate(store, ORG_A, "2020-01-01T00:00:00.000Z");
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await countRetentionCandidates(deps);

    expect(result).toEqual({ count: 0, retentionMonths: null });
  });

  it("no candidates: returns zero (not an error)", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 6 });
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    await expect(countRetentionCandidates(deps)).resolves.toEqual({
      count: 0,
      retentionMonths: 6,
    });
  });

  it("does not expose any lead identity (count only) and writes no audit record", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 6 });
    seedCandidate(store, ORG_A, "2025-01-01T00:00:00.000Z");
    const { deps, audits } = buildExportFake(store, ORG_A, "user_1", NOW);

    await countRetentionCandidates(deps);

    expect(audits).toEqual([]);
  });

  it("isolation: never counts another tenant's candidates", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 6 });
    seedCandidate(store, ORG_A, "2025-01-01T00:00:00.000Z");
    seedCandidate(store, ORG_B, "2025-01-01T00:00:00.000Z");
    seedCandidate(store, ORG_B, "2025-01-01T00:00:00.000Z");
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await countRetentionCandidates(deps);

    expect(result.count).toBe(1);
  });

  it("a negative/invalid explicit months never matches candidates in the future", async () => {
    const store = new PrivacyStore();
    seedCandidate(store, ORG_A, "2026-06-19T11:00:00.000Z");
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await countRetentionCandidates(deps, -1);

    expect(result).toEqual({ count: 0, retentionMonths: -1 });
  });
});
