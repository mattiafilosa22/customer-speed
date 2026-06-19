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
const exportLeadDataXlsx = vi.fn();

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
vi.mock("@/server/privacy", () => ({
  buildExportDeps: (..._a: unknown[]) => ({ deps: true }),
  buildErasureDeps: (..._a: unknown[]) => ({ deps: true }),
  exportLeadData: vi.fn(),
  exportLeadDataXlsx: (...a: unknown[]) => exportLeadDataXlsx(...a),
  eraseLeadData: vi.fn(),
}));

import {
  changeStageAction,
  createLeadAction,
  deleteLeadAction,
  exportLeadDataXlsxAction,
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

describe("exportLeadDataXlsxAction", () => {
  it("checks auth + lead.exportData and returns the base64 .xlsx (happy path)", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    exportLeadDataXlsx.mockResolvedValue({
      filename: "lead-lead_1-export.xlsx",
      buffer: Buffer.from("hello-xlsx"),
    });

    const res = await exportLeadDataXlsxAction("lead_1");

    expect(requirePermission).toHaveBeenCalledWith("proUser", "lead.exportData");
    expect(res).toEqual({
      status: "success",
      filename: "lead-lead_1-export.xlsx",
      base64: Buffer.from("hello-xlsx").toString("base64"),
    });
  });

  it("returns a generic unauthorized key (no throw) when unauthenticated", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const res = await exportLeadDataXlsxAction("lead_1");
    expect(res).toMatchObject({ status: "error", formError: "leads.errors.unauthorized" });
    expect(exportLeadDataXlsx).not.toHaveBeenCalled();
  });

  it("returns an error key (no throw) when the role lacks lead.exportData", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockImplementation(() => {
      throw new UnauthorizedError();
    });
    const res = await exportLeadDataXlsxAction("lead_1");
    expect(res).toMatchObject({ status: "error", formError: "leads.errors.unauthorized" });
    expect(exportLeadDataXlsx).not.toHaveBeenCalled();
  });

  it("maps NotFoundError (cross-tenant id) to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(TENANT);
    requirePermission.mockReturnValue(undefined);
    exportLeadDataXlsx.mockRejectedValue(new NotFoundError());
    const res = await exportLeadDataXlsxAction("foreign_lead");
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
