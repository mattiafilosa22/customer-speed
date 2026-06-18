import { afterEach, describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";

/**
 * Invoice Server Action tests. The actions are the UI's security boundary:
 * auth (tenant context) → RBAC (`invoice.create`, NOT baseUser) → use case →
 * `ActionState` with a STABLE i18n key. We mock the context, RBAC and the
 * invoice use cases.
 */

const requireTenantContext = vi.fn();
const requirePermission = vi.fn();
const buildInvoiceDeps = vi.fn((..._a: unknown[]) => ({ kind: "invoice" }));
const createInvoice = vi.fn((...args: unknown[]): unknown => args);
const deleteInvoice = vi.fn((...args: unknown[]): unknown => args);

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return { ...actual, requirePermission: (...a: unknown[]) => requirePermission(...a) };
});
vi.mock("@/server/invoices", () => ({
  buildInvoiceDeps: (...a: unknown[]) => buildInvoiceDeps(...a),
  createInvoice: (...a: unknown[]) => createInvoice(...a),
  deleteInvoice: (...a: unknown[]) => deleteInvoice(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createInvoiceAction, deleteInvoiceAction } from "@/app/[locale]/(app)/invoices/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };
const IDLE = { status: "idle" } as const;

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const validForm = () =>
  form({
    leadId: "lead_1",
    grossAmount: "1220.00",
    netAmount: "1000.00",
    issuedAt: "2026-06-10",
  });

afterEach(() => vi.clearAllMocks());

describe("createInvoiceAction", () => {
  it("checks invoice.create and calls the use case (happy path, proUser)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createInvoice.mockResolvedValue({ id: "inv_1" });

    const res = await createInvoiceAction(IDLE, validForm());

    expect(requirePermission).toHaveBeenCalledWith("proUser", "invoice.create");
    expect(createInvoice).toHaveBeenCalledWith(
      { kind: "invoice" },
      expect.objectContaining({ leadId: "lead_1", grossAmount: "1220.00", netAmount: "1000.00" }),
    );
    expect(res).toEqual({ status: "success", messageKey: "invoices.create.success" });
  });

  it("denies baseUser (ForbiddenError → unauthorized key; use case never called)", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("invoice.create");
    });

    const res = await createInvoiceAction(IDLE, validForm());

    expect(res).toEqual({ status: "error", formError: "invoices.errors.unauthorized" });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("maps missing auth to the unauthorized key", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    const res = await createInvoiceAction(IDLE, validForm());

    expect(res).toEqual({ status: "error", formError: "invoices.errors.unauthorized" });
  });

  it("surfaces the leadNotWon ConflictError key verbatim", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createInvoice.mockRejectedValue(new ConflictError("invoices.errors.leadNotWon"));

    const res = await createInvoiceAction(IDLE, validForm());

    expect(res).toEqual({ status: "error", formError: "invoices.errors.leadNotWon" });
  });

  it("maps a ValidationError to per-field keys", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createInvoice.mockRejectedValue(new ValidationError({ netAmount: ["bad"] }));

    const res = await createInvoiceAction(IDLE, validForm());

    expect(res).toEqual({
      status: "error",
      fieldErrors: { netAmount: "invoices.errors.fields.netAmount" },
    });
  });

  it("maps a NotFoundError (cross-tenant lead) to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createInvoice.mockRejectedValue(new NotFoundError());

    const res = await createInvoiceAction(IDLE, validForm());

    expect(res).toEqual({ status: "error", formError: "invoices.errors.notFound" });
  });
});

describe("deleteInvoiceAction", () => {
  it("checks invoice.create and deletes (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    deleteInvoice.mockResolvedValue({ id: "inv_1", leadId: "lead_1" });

    const res = await deleteInvoiceAction(IDLE, form({ invoiceId: "inv_1" }));

    expect(requirePermission).toHaveBeenCalledWith("proUser", "invoice.create");
    expect(res).toEqual({ status: "success", messageKey: "invoices.delete.success" });
  });

  it("denies baseUser (use case never called)", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("invoice.create");
    });

    const res = await deleteInvoiceAction(IDLE, form({ invoiceId: "inv_1" }));

    expect(res).toEqual({ status: "error", formError: "invoices.errors.unauthorized" });
    expect(deleteInvoice).not.toHaveBeenCalled();
  });
});
