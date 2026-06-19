import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { deleteInvoice } from "@/server/invoices/delete-invoice";
import { buildFakeInvoiceDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("deleteInvoice", () => {
  it("deletes an own invoice and returns its leadId (happy path, audited)", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    const invoice = store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "100.00",
      netAmount: "90.00",
    });
    const { deps, audits } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    const result = await deleteInvoice(deps, { invoiceId: invoice.id });

    expect(result).toEqual({ id: invoice.id, leadId: won.id });
    expect(store.invoices).toHaveLength(0);
    expect(audits.at(-1)?.action).toBe("invoice.delete");
  });

  it("returns NotFound for a cross-tenant invoice and does NOT delete it (isolation)", async () => {
    const store = new DashboardStore();
    const wonB = store.addLead({ organizationId: ORG_B, stage: LeadStage.WON });
    const invoiceB = store.addInvoice({
      organizationId: ORG_B,
      leadId: wonB.id,
      grossAmount: "100.00",
      netAmount: "90.00",
    });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(deleteInvoice(deps, { invoiceId: invoiceB.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(store.invoices).toHaveLength(1); // untouched
  });

  it("returns NotFound for a missing invoice id", async () => {
    const store = new DashboardStore();
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(deleteInvoice(deps, { invoiceId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a missing invoiceId (invalid input)", async () => {
    const store = new DashboardStore();
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(deleteInvoice(deps, {})).rejects.toBeInstanceOf(ValidationError);
  });
});
