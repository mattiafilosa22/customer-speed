import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { createInvoice, INVOICE_ERRORS } from "@/server/invoices/create-invoice";
import { buildFakeInvoiceDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

const validInput = (leadId: string) => ({
  leadId,
  number: "2026-001",
  grossAmount: "1220.00",
  netAmount: "1000.00",
  issuedAt: "2026-06-10",
});

describe("createInvoice", () => {
  it("creates an invoice on a WON lead with Decimal amounts (happy path)", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    const { deps, audits } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    const result = await createInvoice(deps, validInput(won.id));

    expect(result.id).toBeTruthy();
    const created = store.invoice(0);
    expect(created.organizationId).toBe(ORG_A);
    expect(created.leadId).toBe(won.id);
    expect(created.grossAmount.toFixed(2)).toBe("1220.00");
    expect(created.netAmount.toFixed(2)).toBe("1000.00");
    expect(audits.at(-1)?.action).toBe("invoice.create");
  });

  it("accepts a comma decimal separator and an optional missing number", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await createInvoice(deps, {
      leadId: won.id,
      grossAmount: "1.234,50".replace(/\./g, ""), // ensure plain "1234,50"
      netAmount: "1000,00",
      issuedAt: "2026-06-10",
    });

    const created = store.invoice(0);
    expect(created.number).toBeNull();
    expect(created.netAmount.toFixed(2)).toBe("1000.00");
  });

  it("rejects attaching an invoice to a non-WON lead (ConflictError + leadNotWon key)", async () => {
    const store = new DashboardStore();
    const active = store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(createInvoice(deps, validInput(active.id))).rejects.toMatchObject({
      message: INVOICE_ERRORS.leadNotWon,
    });
    await expect(createInvoice(deps, validInput(active.id))).rejects.toBeInstanceOf(ConflictError);
    expect(store.invoices).toHaveLength(0);
  });

  it("rejects a cross-tenant lead as NotFound (isolation)", async () => {
    const store = new DashboardStore();
    const wonB = store.addLead({ organizationId: ORG_B, stage: LeadStage.WON });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(createInvoice(deps, validInput(wonB.id))).rejects.toBeInstanceOf(NotFoundError);
    expect(store.invoices).toHaveLength(0);
  });

  it("rejects invalid amounts (negative / >2 decimals / net > gross)", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(
      createInvoice(deps, { ...validInput(won.id), grossAmount: "-5" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createInvoice(deps, { ...validInput(won.id), netAmount: "10.999" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createInvoice(deps, { ...validInput(won.id), grossAmount: "100", netAmount: "200" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.invoices).toHaveLength(0);
  });

  it("rejects an invalid issue date", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(
      createInvoice(deps, { ...validInput(won.id), issuedAt: "not-a-date" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
