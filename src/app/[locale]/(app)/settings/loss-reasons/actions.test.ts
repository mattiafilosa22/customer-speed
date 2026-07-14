import { afterEach, describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";

/**
 * Loss-reasons Server Action tests — the security boundary for the Settings
 * screen: auth (tenant context) → RBAC (`settings.tenant`) → use case, mapping
 * typed domain errors to STABLE i18n keys. Mirrors `pipeline/actions.test.ts`:
 * we mock the context/RBAC/use-case wiring and use the REAL `requirePermission`
 * capability matrix behaviour is exercised via the mocked `requirePermission`
 * throwing exactly what the real one throws for a denied role.
 */

const requireTenantContext = vi.fn();
const requirePermission = vi.fn();
const buildLossReasonDeps = vi.fn((..._a: unknown[]) => ({ kind: "loss-reason" }));
const createLossReason = vi.fn((...args: unknown[]): unknown => args);
const updateLossReason = vi.fn((...args: unknown[]): unknown => args);
const setLossReasonActive = vi.fn((...args: unknown[]): unknown => args);
const reorderLossReasons = vi.fn((...args: unknown[]): unknown => args);

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return { ...actual, requirePermission: (...a: unknown[]) => requirePermission(...a) };
});
vi.mock("@/server/loss-reasons", () => ({
  buildLossReasonDeps: (...a: unknown[]) => buildLossReasonDeps(...a),
  createLossReason: (...a: unknown[]) => createLossReason(...a),
  updateLossReason: (...a: unknown[]) => updateLossReason(...a),
  setLossReasonActive: (...a: unknown[]) => setLossReasonActive(...a),
  reorderLossReasons: (...a: unknown[]) => reorderLossReasons(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createLossReasonAction,
  reorderLossReasonsAction,
  toggleLossReasonActiveAction,
  updateLossReasonAction,
} from "@/app/[locale]/(app)/settings/loss-reasons/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };

const ITEM = { id: "loss_1", label: "Budget insufficiente", isActive: true, sortOrder: 0 };

afterEach(() => vi.clearAllMocks());

// ── createLossReasonAction ──────────────────────────────────────────────────

describe("createLossReasonAction", () => {
  it("checks settings.tenant and creates (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createLossReason.mockResolvedValue(ITEM);

    const res = await createLossReasonAction({ label: "Budget insufficiente" });

    expect(requirePermission).toHaveBeenCalledWith("proUser", "settings.tenant");
    expect(buildLossReasonDeps).toHaveBeenCalledWith(PRO);
    expect(createLossReason).toHaveBeenCalledWith(
      { kind: "loss-reason" },
      { label: "Budget insufficiente" },
    );
    expect(res).toEqual(ITEM);
  });

  it("throws the unauthorized key when unauthenticated (no write)", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    await expect(createLossReasonAction({ label: "x" })).rejects.toThrow(
      "lossReasons.errors.unauthorized",
    );
    expect(createLossReason).not.toHaveBeenCalled();
  });

  it("DENIES baseUser (no settings.tenant) → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("settings.tenant");
    });

    await expect(createLossReasonAction({ label: "x" })).rejects.toThrow(
      "lossReasons.errors.unauthorized",
    );
    expect(createLossReason).not.toHaveBeenCalled();
  });

  it("maps a ValidationError from the use case to the invalid key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createLossReason.mockRejectedValue(new ValidationError({ label: ["Required"] }));

    await expect(createLossReasonAction({ label: "" })).rejects.toThrow(
      "lossReasons.errors.invalid",
    );
  });

  it("surfaces a duplicate-label ConflictError verbatim", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createLossReason.mockRejectedValue(new ConflictError("lossReasons.errors.duplicateLabel"));

    await expect(createLossReasonAction({ label: "Budget insufficiente" })).rejects.toThrow(
      "lossReasons.errors.duplicateLabel",
    );
  });
});

// ── updateLossReasonAction ──────────────────────────────────────────────────

describe("updateLossReasonAction", () => {
  it("checks settings.tenant and renames (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    updateLossReason.mockResolvedValue({ ...ITEM, label: "Rinominato" });

    const res = await updateLossReasonAction({ id: "loss_1", label: "Rinominato" });

    expect(requirePermission).toHaveBeenCalledWith("proUser", "settings.tenant");
    expect(updateLossReason).toHaveBeenCalledWith(
      { kind: "loss-reason" },
      { id: "loss_1", label: "Rinominato" },
    );
    expect(res.label).toBe("Rinominato");
  });

  it("DENIES baseUser → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("settings.tenant");
    });

    await expect(updateLossReasonAction({ id: "loss_1", label: "x" })).rejects.toThrow(
      "lossReasons.errors.unauthorized",
    );
    expect(updateLossReason).not.toHaveBeenCalled();
  });

  it("maps a cross-tenant NotFoundError to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    updateLossReason.mockRejectedValue(new NotFoundError("Loss reason not found"));

    await expect(updateLossReasonAction({ id: "loss_x", label: "x" })).rejects.toThrow(
      "lossReasons.errors.notFound",
    );
  });
});

// ── toggleLossReasonActiveAction ────────────────────────────────────────────

describe("toggleLossReasonActiveAction", () => {
  it("checks settings.tenant and toggles (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    setLossReasonActive.mockResolvedValue({ ...ITEM, isActive: false });

    const res = await toggleLossReasonActiveAction({ id: "loss_1", isActive: false });

    expect(requirePermission).toHaveBeenCalledWith("proUser", "settings.tenant");
    expect(setLossReasonActive).toHaveBeenCalledWith(
      { kind: "loss-reason" },
      { id: "loss_1", isActive: false },
    );
    expect(res.isActive).toBe(false);
  });

  it("DENIES baseUser → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("settings.tenant");
    });

    await expect(
      toggleLossReasonActiveAction({ id: "loss_1", isActive: false }),
    ).rejects.toThrow("lossReasons.errors.unauthorized");
    expect(setLossReasonActive).not.toHaveBeenCalled();
  });

  it("maps a cross-tenant NotFoundError to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    setLossReasonActive.mockRejectedValue(new NotFoundError("Loss reason not found"));

    await expect(
      toggleLossReasonActiveAction({ id: "loss_x", isActive: false }),
    ).rejects.toThrow("lossReasons.errors.notFound");
  });
});

// ── reorderLossReasonsAction ────────────────────────────────────────────────

describe("reorderLossReasonsAction", () => {
  it("checks settings.tenant and reorders (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    reorderLossReasons.mockResolvedValue({ order: ["loss_2", "loss_1"] });

    const res = await reorderLossReasonsAction({ order: ["loss_2", "loss_1"] });

    expect(requirePermission).toHaveBeenCalledWith("proUser", "settings.tenant");
    expect(reorderLossReasons).toHaveBeenCalledWith(
      { kind: "loss-reason" },
      { order: ["loss_2", "loss_1"] },
    );
    expect(res).toEqual({ order: ["loss_2", "loss_1"] });
  });

  it("DENIES baseUser → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("settings.tenant");
    });

    await expect(reorderLossReasonsAction({ order: ["loss_1"] })).rejects.toThrow(
      "lossReasons.errors.unauthorized",
    );
    expect(reorderLossReasons).not.toHaveBeenCalled();
  });

  it("maps an incomplete/foreign order (NotFoundError) to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    reorderLossReasons.mockRejectedValue(new NotFoundError("Loss reason not found"));

    await expect(reorderLossReasonsAction({ order: ["loss_1"] })).rejects.toThrow(
      "lossReasons.errors.notFound",
    );
  });

  it("maps a duplicated-id ValidationError to the invalid key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    reorderLossReasons.mockRejectedValue(new ValidationError({ order: ["dup"] }));

    await expect(
      reorderLossReasonsAction({ order: ["loss_1", "loss_1"] }),
    ).rejects.toThrow("lossReasons.errors.invalid");
  });
});
