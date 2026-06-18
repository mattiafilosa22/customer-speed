import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { listInvoices } from "@/server/invoices/list-invoices";
import { buildFakeInvoiceDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("listInvoices", () => {
  it("lists a lead's invoices newest issuedAt first, amounts as fixed-2 strings", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "100.00",
      netAmount: "90.00",
      issuedAt: new Date(Date.UTC(2026, 5, 1)),
    });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "200.50",
      netAmount: "180.40",
      issuedAt: new Date(Date.UTC(2026, 5, 10)),
    });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    const { data } = await listInvoices(deps, { leadId: won.id });

    expect(data).toHaveLength(2);
    expect(data[0]?.issuedAt.getUTCDate()).toBe(10); // newest first
    expect(data[0]?.grossAmount).toBe("200.50");
    expect(data[0]?.netAmount).toBe("180.40");
    expect(data[1]?.grossAmount).toBe("100.00");
  });

  it("returns NotFound for a cross-tenant lead (isolation)", async () => {
    const store = new DashboardStore();
    const wonB = store.addLead({ organizationId: ORG_B, stage: LeadStage.WON });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(listInvoices(deps, { leadId: wonB.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not return another tenant's invoices for an own lead", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    // An invoice that (wrongly) references our lead but belongs to org B must be invisible.
    store.addInvoice({
      organizationId: ORG_B,
      leadId: won.id,
      grossAmount: "999.00",
      netAmount: "999.00",
      issuedAt: new Date(),
    });
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    const { data } = await listInvoices(deps, { leadId: won.id });
    expect(data).toEqual([]);
  });

  it("rejects a missing leadId", async () => {
    const store = new DashboardStore();
    const { deps } = buildFakeInvoiceDeps(store, ORG_A, USER_A);

    await expect(listInvoices(deps, {})).rejects.toBeInstanceOf(ValidationError);
  });
});
