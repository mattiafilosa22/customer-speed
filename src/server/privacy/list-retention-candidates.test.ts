import { describe, expect, it } from "vitest";

import { listRetentionCandidates } from "@/server/privacy/list-retention-candidates";
import { buildExportFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

// Fixed "now" used by buildExportFake's default clock.
const NOW = new Date("2026-06-19T12:00:00.000Z");
// Exact `months=6` cutoff: now minus 6 calendar months.
const CUTOFF_6M = new Date("2025-12-19T12:00:00.000Z");

describe("listRetentionCandidates", () => {
  it("happy path: selects LOST leads with a loss reason aged past the cutoff", async () => {
    const store = new PrivacyStore();
    const candidate = store.addLead({
      organizationId: ORG_A,
      firstName: "Mario",
      lastName: "Rossi",
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toEqual([
      {
        id: candidate.id,
        firstName: "Mario",
        lastName: "Rossi",
        stageChangedAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("boundary: stageChangedAt exactly at the cutoff IS included (lte)", async () => {
    const store = new PrivacyStore();
    const atCutoff = store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: CUTOFF_6M,
    });
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await listRetentionCandidates(deps, 6);

    expect(result.map((r) => r.id)).toEqual([atCutoff.id]);
  });

  it("boundary: stageChangedAt one ms AFTER the cutoff is excluded (not aged enough)", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date(CUTOFF_6M.getTime() + 1),
    });
    const { deps } = buildExportFake(store, ORG_A, "user_1", NOW);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toHaveLength(0);
  });

  it("excludes LOST leads with no recorded loss reason", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: null,
      lossReasonCustomText: null,
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toHaveLength(0);
  });

  it("includes LOST leads with only a custom loss reason (lossReasonId null, 'Altro')", async () => {
    const store = new PrivacyStore();
    const candidate = store.addLead({
      organizationId: ORG_A,
      firstName: "Anna",
      lastName: "Verdi",
      stage: "LOST",
      lossReasonId: null,
      lossReasonCustomText: "Preferisce un altro consulente",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result.map((r) => r.id)).toEqual([candidate.id]);
  });

  it("excludes leads not in stage LOST, even if old enough", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_A,
      stage: "WON",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toHaveLength(0);
  });

  it("excludes soft-deleted leads", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
      deletedAt: new Date("2025-06-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toHaveLength(0);
  });

  it("excludes already-anonymized leads (nothing left to purge)", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
      anonymizedAt: new Date("2025-06-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toHaveLength(0);
  });

  it("isolation: never returns another tenant's matching lead", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_B,
      firstName: "Other",
      lastName: "Tenant",
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result).toHaveLength(0);
  });

  it("minimization: returns only id/firstName/lastName/stageChangedAt", async () => {
    const store = new PrivacyStore();
    store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      email: "secret@example.com",
      adminNotes: "should never leak here",
      stageChangedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(Object.keys(result[0]!).sort()).toEqual(
      ["firstName", "id", "lastName", "stageChangedAt"].sort(),
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "invalid months (%s) matches nothing rather than throwing",
    async (months) => {
      const store = new PrivacyStore();
      store.addLead({
        organizationId: ORG_A,
        stage: "LOST",
        lossReasonId: "reason_1",
        stageChangedAt: new Date("2020-01-01T00:00:00.000Z"),
      });
      const { deps } = buildExportFake(store, ORG_A);

      const result = await listRetentionCandidates(deps, months);

      expect(result).toHaveLength(0);
    },
  );

  it("orders results by stageChangedAt ascending (oldest first)", async () => {
    const store = new PrivacyStore();
    const newer = store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2024-06-01T00:00:00.000Z"),
    });
    const older = store.addLead({
      organizationId: ORG_A,
      stage: "LOST",
      lossReasonId: "reason_1",
      stageChangedAt: new Date("2023-01-01T00:00:00.000Z"),
    });
    const { deps } = buildExportFake(store, ORG_A);

    const result = await listRetentionCandidates(deps, 6);

    expect(result.map((r) => r.id)).toEqual([older.id, newer.id]);
  });
});
