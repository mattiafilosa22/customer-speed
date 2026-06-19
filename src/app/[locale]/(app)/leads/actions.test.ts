import { afterEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Lead Server Action tests. The actions are the security boundary for the UI:
 * they MUST enforce auth (tenant context) → RBAC → use case, and map typed
 * domain errors to NON-revealing i18n keys (never throw raw to the form).
 *
 * We mock the tenant context, RBAC and the use cases, plus `next/cache` +
 * `next/navigation`, then assert the order/wiring and the returned ActionState.
 */

const requireTenantContext = vi.fn();
const requirePermission = vi.fn();
const buildLeadDeps = vi.fn((..._a: unknown[]) => ({ deps: true }));
const createLead = vi.fn();
const softDeleteLead = vi.fn();
const changeStage = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return { ...actual, requirePermission: (...a: unknown[]) => requirePermission(...a) };
});
vi.mock("@/server/leads", () => ({
  buildLeadDeps: (...a: unknown[]) => buildLeadDeps(...a),
  createLead: (...a: unknown[]) => createLead(...a),
  softDeleteLead: (...a: unknown[]) => softDeleteLead(...a),
  changeStage: (...a: unknown[]) => changeStage(...a),
  // Unused-by-these-tests members still imported by the module:
  updateLead: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  createExternalRef: vi.fn(),
  deleteExternalRef: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  changeStageAction,
  createLeadAction,
  deleteLeadAction,
} from "@/app/[locale]/(app)/leads/actions";

const TENANT = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };

function fd(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(entries)) form.set(k, v);
  return form;
}

afterEach(() => vi.clearAllMocks());

describe("createLeadAction", () => {
  it("checks auth + lead.create and returns success (happy path)", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    createLead.mockResolvedValue({ id: "lead_1" });

    const res = await createLeadAction({ status: "idle" }, fd({ firstName: "Mario", lastName: "Rossi" }));

    expect(requirePermission).toHaveBeenCalledWith("proUser", "lead.create");
    expect(res).toEqual({ status: "success", messageKey: "leads.create.success" });
  });

  it("returns a generic unauthorized key (no throw) when unauthenticated", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const res = await createLeadAction({ status: "idle" }, fd({ firstName: "Mario" }));
    expect(res).toMatchObject({ status: "error", formError: "leads.errors.unauthorized" });
  });

  it("maps ValidationError to per-field i18n keys", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    createLead.mockRejectedValue(new ValidationError({ firstName: ["Required"] }));

    const res = await createLeadAction({ status: "idle" }, fd({ firstName: "" }));
    expect(res).toMatchObject({
      status: "error",
      fieldErrors: { firstName: "leads.errors.fields.firstName" },
    });
  });
});

describe("deleteLeadAction", () => {
  it("requires lead.delete capability", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    softDeleteLead.mockResolvedValue({ id: "lead_1" });

    const res = await deleteLeadAction({ status: "idle" }, fd({ leadId: "lead_1" }));
    expect(requirePermission).toHaveBeenCalledWith("proUser", "lead.delete");
    expect(res).toEqual({ status: "success", messageKey: "leads.delete.success" });
  });

  it("maps NotFoundError (cross-tenant) to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    softDeleteLead.mockRejectedValue(new NotFoundError());

    const res = await deleteLeadAction({ status: "idle" }, fd({ leadId: "x" }));
    expect(res).toMatchObject({ status: "error", formError: "leads.errors.notFound" });
  });
});

describe("changeStageAction", () => {
  it("requires pipeline.move and forwards the loss reason", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    changeStage.mockResolvedValue({ id: "lead_1", changed: true });

    const res = await changeStageAction(
      { status: "idle" },
      fd({ leadId: "lead_1", stage: "LOST", lossReasonId: "loss_1" }),
    );
    expect(requirePermission).toHaveBeenCalledWith("proUser", "pipeline.move");
    expect(changeStage).toHaveBeenCalledWith({ deps: true }, "lead_1", {
      stage: "LOST",
      lossReasonId: "loss_1",
    });
    expect(res).toEqual({ status: "success", messageKey: "leads.stage.success" });
  });
});
