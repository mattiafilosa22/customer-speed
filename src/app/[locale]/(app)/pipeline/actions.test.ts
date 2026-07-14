import { afterEach, describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";
import { LeadStage } from "@/generated/prisma/enums";

/**
 * Pipeline Server Action tests. The actions are the UI's security boundary:
 * auth (tenant context) → RBAC → use case, throwing a STABLE i18n key on
 * failure (so the optimistic mutation rolls back + localizes). We mock the
 * context, RBAC, the lead `changeStage` and the pipeline config use cases.
 */

const requireTenantContext = vi.fn();
const requirePermission = vi.fn();
const buildLeadDeps = vi.fn((..._a: unknown[]) => ({ kind: "lead" }));
const changeStage = vi.fn((...args: unknown[]): unknown => args);
const buildPipelineDeps = vi.fn((..._a: unknown[]) => ({ kind: "pipeline" }));
const updateStageVisibility = vi.fn((...args: unknown[]): unknown => args);
const reorderStages = vi.fn((...args: unknown[]): unknown => args);
const setStageColor = vi.fn((...args: unknown[]): unknown => args);

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return { ...actual, requirePermission: (...a: unknown[]) => requirePermission(...a) };
});
vi.mock("@/server/leads", () => ({
  buildLeadDeps: (...a: unknown[]) => buildLeadDeps(...a),
  changeStage: (...a: unknown[]) => changeStage(...a),
}));
vi.mock("@/server/pipeline", () => ({
  buildPipelineDeps: (...a: unknown[]) => buildPipelineDeps(...a),
  updateStageVisibility: (...a: unknown[]) => updateStageVisibility(...a),
  reorderStages: (...a: unknown[]) => reorderStages(...a),
  setStageColor: (...a: unknown[]) => setStageColor(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  moveLeadStageAction,
  reorderStagesAction,
  setStageColorAction,
  setStageVisibilityAction,
} from "@/app/[locale]/(app)/pipeline/actions";

const TENANT = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };

afterEach(() => vi.clearAllMocks());

describe("moveLeadStageAction", () => {
  it("checks pipeline.move and reuses changeStage (happy path)", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    changeStage.mockResolvedValue({ id: "lead_1", changed: true });

    const res = await moveLeadStageAction({ leadId: "lead_1", stage: LeadStage.TAKEN });

    expect(requirePermission).toHaveBeenCalledWith("proUser", "pipeline.move");
    expect(changeStage).toHaveBeenCalledWith({ kind: "lead" }, "lead_1", {
      stage: LeadStage.TAKEN,
      lossReasonId: undefined,
    });
    expect(res).toEqual({ ok: true });
  });

  it("forwards the loss reason when moving to LOST", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    changeStage.mockResolvedValue({ id: "lead_1", changed: true });

    await moveLeadStageAction({ leadId: "lead_1", stage: LeadStage.LOST, lossReasonId: "loss_1" });

    expect(changeStage).toHaveBeenCalledWith({ kind: "lead" }, "lead_1", {
      stage: LeadStage.LOST,
      lossReasonId: "loss_1",
    });
  });

  it("forwards a free-text lossReasonCustomText when moving to LOST via 'Altro'", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    changeStage.mockResolvedValue({ id: "lead_1", changed: true });

    await moveLeadStageAction({
      leadId: "lead_1",
      stage: LeadStage.LOST,
      lossReasonCustomText: "Non risponde più alle chiamate",
    });

    expect(changeStage).toHaveBeenCalledWith({ kind: "lead" }, "lead_1", {
      stage: LeadStage.LOST,
      lossReasonId: undefined,
      lossReasonCustomText: "Non risponde più alle chiamate",
    });
  });

  it("throws an unauthorized key when unauthenticated", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    await expect(
      moveLeadStageAction({ leadId: "x", stage: LeadStage.TAKEN }),
    ).rejects.toThrow("pipeline.errors.unauthorized");
  });

  it("throws notFound key for a cross-tenant lead", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    changeStage.mockRejectedValue(new NotFoundError());
    await expect(
      moveLeadStageAction({ leadId: "x", stage: LeadStage.TAKEN }),
    ).rejects.toThrow("pipeline.errors.notFound");
  });
});

describe("config actions require pipeline.configureStages", () => {
  it("setStageVisibilityAction (happy path, proUser)", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    updateStageVisibility.mockResolvedValue({ stage: "TAKEN", isVisible: false });

    const res = await setStageVisibilityAction({ stage: LeadStage.TAKEN, isVisible: false });

    expect(requirePermission).toHaveBeenCalledWith("proUser", "pipeline.configureStages");
    expect(updateStageVisibility).toHaveBeenCalledWith({ kind: "pipeline" }, {
      stage: LeadStage.TAKEN,
      isVisible: false,
    });
    expect(res).toEqual({ ok: true });
  });

  it("baseUser is denied (ForbiddenError → unauthorized key, use case never called)", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("pipeline.configureStages");
    });

    await expect(
      setStageVisibilityAction({ stage: LeadStage.TAKEN, isVisible: false }),
    ).rejects.toThrow("pipeline.errors.unauthorized");
    expect(updateStageVisibility).not.toHaveBeenCalled();
  });

  it("surfaces the specific ConflictError code (e.g. hide with leads) verbatim", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    updateStageVisibility.mockRejectedValue(
      new ConflictError("pipeline.errors.config.hideWithLeads"),
    );

    await expect(
      setStageVisibilityAction({ stage: LeadStage.TAKEN, isVisible: false }),
    ).rejects.toThrow("pipeline.errors.config.hideWithLeads");
  });

  it("reorderStagesAction maps ValidationError to the invalid key", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    reorderStages.mockRejectedValue(new ValidationError({ order: ["bad"] }));

    await expect(
      reorderStagesAction({ order: [LeadStage.TAKEN] }),
    ).rejects.toThrow("pipeline.errors.invalid");
  });

  it("setStageColorAction (happy path)", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    setStageColor.mockResolvedValue({ stage: "TAKEN", colorToken: "--stage-won" });

    const res = await setStageColorAction({ stage: LeadStage.TAKEN, colorToken: "--stage-won" });
    expect(requirePermission).toHaveBeenCalledWith("proUser", "pipeline.configureStages");
    expect(res).toEqual({ ok: true });
  });
});
