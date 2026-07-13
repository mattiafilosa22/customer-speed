import { afterEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Data-retention Server Action tests — the security boundary for the settings
 * screen: auth (tenant context) → RBAC → use case, mapping typed domain errors
 * to STABLE i18n keys / non-revealing `ActionState`s.
 *
 * We use the REAL `requirePermission` (imported actual, not mocked) so the
 * baseUser denial is exercised against the ACTUAL capability matrix
 * (`settings.tenant` / `lead.exportData` / `lead.eraseData`), and the REAL
 * `@/server/privacy` Zod schemas (`purgeRetentionCandidatesSchema`,
 * `retentionMonthsOverrideSchema`) so invalid client input is genuinely
 * rejected — only the use cases / deps builders are mocked.
 */

const requireTenantContext = vi.fn();
const buildOrganizationDeps = vi.fn((..._a: unknown[]) => ({ kind: "org" }));
const updateOrganizationRetention = vi.fn();
const buildExportDeps = vi.fn((..._a: unknown[]) => ({ kind: "privacy-export" }));
const buildErasureDeps = vi.fn((..._a: unknown[]) => ({ kind: "privacy-erasure" }));
const countRetentionCandidates = vi.fn();
const exportRetentionCandidates = vi.fn();
const purgeRetentionCandidates = vi.fn();
const resolveRetentionMonths = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/server/organization", async () => {
  const actual =
    await vi.importActual<typeof import("@/server/organization")>("@/server/organization");
  return {
    ...actual,
    buildOrganizationDeps: (...a: unknown[]) => buildOrganizationDeps(...a),
    updateOrganizationRetention: (...a: unknown[]) => updateOrganizationRetention(...a),
  };
});
vi.mock("@/server/privacy", async () => {
  const actual = await vi.importActual<typeof import("@/server/privacy")>("@/server/privacy");
  return {
    ...actual,
    buildExportDeps: (...a: unknown[]) => buildExportDeps(...a),
    buildErasureDeps: (...a: unknown[]) => buildErasureDeps(...a),
    countRetentionCandidates: (...a: unknown[]) => countRetentionCandidates(...a),
    exportRetentionCandidates: (...a: unknown[]) => exportRetentionCandidates(...a),
    purgeRetentionCandidates: (...a: unknown[]) => purgeRetentionCandidates(...a),
    resolveRetentionMonths: (...a: unknown[]) => resolveRetentionMonths(...a),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  exportRetentionCandidatesAction,
  getRetentionCandidatesCountAction,
  purgeRetentionCandidatesAction,
  updateRetentionSettingsAction,
} from "@/app/[locale]/(app)/settings/data-retention/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };

afterEach(() => vi.clearAllMocks());

// ── updateRetentionSettingsAction ───────────────────────────────────────────

describe("updateRetentionSettingsAction", () => {
  it("checks settings.tenant and persists (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    updateOrganizationRetention.mockResolvedValue({ ok: true });

    const res = await updateRetentionSettingsAction({ leadRetentionMonths: 12 });

    expect(buildOrganizationDeps).toHaveBeenCalledWith(PRO);
    expect(updateOrganizationRetention).toHaveBeenCalledWith(
      { kind: "org" },
      { leadRetentionMonths: 12 },
    );
    expect(res).toEqual({ ok: true });
  });

  it("maps missing auth to the unauthorized key (no write)", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    await expect(updateRetentionSettingsAction({ leadRetentionMonths: 12 })).rejects.toThrow(
      "dataRetention.errors.unauthorized",
    );
    expect(updateOrganizationRetention).not.toHaveBeenCalled();
  });

  it("DENIES baseUser (no settings.tenant) → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);

    await expect(updateRetentionSettingsAction({ leadRetentionMonths: 12 })).rejects.toThrow(
      "dataRetention.errors.unauthorized",
    );
    expect(updateOrganizationRetention).not.toHaveBeenCalled();
  });

  it("maps a ValidationError from the use case to the invalid key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    updateOrganizationRetention.mockRejectedValue(
      new ValidationError({ leadRetentionMonths: ["Must be at least 1 month"] }),
    );

    await expect(updateRetentionSettingsAction({ leadRetentionMonths: 0 })).rejects.toThrow(
      "dataRetention.errors.invalid",
    );
  });
});

// ── getRetentionCandidatesCountAction ───────────────────────────────────────

describe("getRetentionCandidatesCountAction", () => {
  it("checks settings.tenant and returns the preview count (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    countRetentionCandidates.mockResolvedValue({ count: 3, retentionMonths: 6 });

    const res = await getRetentionCandidatesCountAction();

    expect(buildExportDeps).toHaveBeenCalledWith(PRO);
    expect(res).toEqual({ count: 3, retentionMonths: 6 });
  });

  it("maps missing auth to the unauthorized key", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    await expect(getRetentionCandidatesCountAction()).rejects.toThrow(
      "dataRetention.errors.unauthorized",
    );
    expect(countRetentionCandidates).not.toHaveBeenCalled();
  });

  it("DENIES baseUser (no settings.tenant)", async () => {
    requireTenantContext.mockResolvedValue(BASE);

    await expect(getRetentionCandidatesCountAction()).rejects.toThrow(
      "dataRetention.errors.unauthorized",
    );
    expect(countRetentionCandidates).not.toHaveBeenCalled();
  });
});

// ── exportRetentionCandidatesAction ─────────────────────────────────────────

const sampleExport = {
  format: "customerspeed.retention-export.v1" as const,
  exportedAt: "2026-07-13T10:00:00.000Z",
  criteria: { stage: "LOST" as const, retentionMonths: 6 },
  count: 2,
  leads: [
    { subject: { kind: "lead" as const, id: "lead_1" } },
    { subject: { kind: "lead" as const, id: "lead_2" } },
  ],
};

describe("exportRetentionCandidatesAction", () => {
  it("checks lead.exportData, resolves months and returns the backup + derived leadIds (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    resolveRetentionMonths.mockResolvedValue(6);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial fixture, only the fields the action reads
    exportRetentionCandidates.mockResolvedValue(sampleExport as any);

    const res = await exportRetentionCandidatesAction();

    expect(buildExportDeps).toHaveBeenCalledWith(PRO);
    expect(exportRetentionCandidates).toHaveBeenCalledWith({ kind: "privacy-export" }, 6);
    expect(res).toEqual({
      status: "success",
      filename: "retention-export-2026-07-13.json",
      data: sampleExport,
      leadIds: ["lead_1", "lead_2"],
    });
  });

  it("falls back to 0 months (empty export) when retention is not configured for the tenant", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    resolveRetentionMonths.mockResolvedValue(null);
    exportRetentionCandidates.mockResolvedValue({
      ...sampleExport,
      count: 0,
      leads: [],
      criteria: { stage: "LOST", retentionMonths: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await exportRetentionCandidatesAction();

    expect(exportRetentionCandidates).toHaveBeenCalledWith({ kind: "privacy-export" }, 0);
    expect(res).toMatchObject({ status: "success", leadIds: [] });
  });

  it("maps missing auth to a non-revealing error state (no export call)", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    const res = await exportRetentionCandidatesAction();

    expect(res).toMatchObject({ status: "error", formError: "gdpr.errors.unauthorized" });
    expect(exportRetentionCandidates).not.toHaveBeenCalled();
  });

  it("DENIES baseUser (no lead.exportData) → error state, no export call", async () => {
    requireTenantContext.mockResolvedValue(BASE);

    const res = await exportRetentionCandidatesAction();

    expect(res).toMatchObject({ status: "error", formError: "gdpr.errors.unauthorized" });
    expect(exportRetentionCandidates).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range months override (real Zod schema) before touching the use case", async () => {
    requireTenantContext.mockResolvedValue(PRO);

    const res = await exportRetentionCandidatesAction(0);

    expect(res).toMatchObject({ status: "error" });
    expect(exportRetentionCandidates).not.toHaveBeenCalled();
  });

  it("propagates a NotFoundError from the use case (e.g. tenant row race) as the notFound-mapped generic key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    resolveRetentionMonths.mockResolvedValue(6);
    exportRetentionCandidates.mockRejectedValue(new NotFoundError());

    const res = await exportRetentionCandidatesAction();

    expect(res).toMatchObject({ status: "error", formError: "gdpr.errors.generic" });
  });
});

// ── purgeRetentionCandidatesAction ──────────────────────────────────────────

describe("purgeRetentionCandidatesAction", () => {
  it("checks lead.eraseData and purges the given ids (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    purgeRetentionCandidates.mockResolvedValue({
      requested: 2,
      anonymized: 2,
      alreadyAnonymized: 0,
      failed: [],
    });

    const res = await purgeRetentionCandidatesAction(["lead_1", "lead_2"]);

    expect(buildErasureDeps).toHaveBeenCalledWith(PRO);
    expect(purgeRetentionCandidates).toHaveBeenCalledWith({ kind: "privacy-erasure" }, [
      "lead_1",
      "lead_2",
    ]);
    expect(res).toEqual({
      status: "success",
      requested: 2,
      anonymized: 2,
      alreadyAnonymized: 0,
      failed: [],
    });
  });

  it("maps missing auth to a non-revealing error state (no purge call)", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    const res = await purgeRetentionCandidatesAction(["lead_1"]);

    expect(res).toMatchObject({ status: "error", formError: "gdpr.errors.unauthorized" });
    expect(purgeRetentionCandidates).not.toHaveBeenCalled();
  });

  it("DENIES baseUser (no lead.eraseData) → error state, no purge call", async () => {
    requireTenantContext.mockResolvedValue(BASE);

    const res = await purgeRetentionCandidatesAction(["lead_1"]);

    expect(res).toMatchObject({ status: "error", formError: "gdpr.errors.unauthorized" });
    expect(purgeRetentionCandidates).not.toHaveBeenCalled();
  });

  it("rejects an empty leadIds array (real Zod schema) before touching the use case", async () => {
    requireTenantContext.mockResolvedValue(PRO);

    const res = await purgeRetentionCandidatesAction([]);

    expect(res).toMatchObject({ status: "error" });
    expect(purgeRetentionCandidates).not.toHaveBeenCalled();
  });

  it("never silently succeeds for a foreign-tenant id: a `failed` id is surfaced, not swallowed", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    purgeRetentionCandidates.mockResolvedValue({
      requested: 1,
      anonymized: 0,
      alreadyAnonymized: 0,
      failed: ["foreign_lead"],
    });

    const res = await purgeRetentionCandidatesAction(["foreign_lead"]);

    expect(res).toMatchObject({ status: "success", failed: ["foreign_lead"], anonymized: 0 });
  });
});
