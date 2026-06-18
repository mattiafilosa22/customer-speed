import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { getInvoiceSummary } from "@/server/dashboard/get-invoice-summary";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("getInvoiceSummary", () => {
  it("aggregates count + gross/net totals for WON-lead invoices in the period", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "1220.00",
      netAmount: "1000.00",
      issuedAt: jun(10),
    });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "2440.00",
      netAmount: "2000.00",
      issuedAt: jun(11),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const summary = await getInvoiceSummary(deps, { year: "2026", month: "6" });

    expect(summary.count).toBe(2);
    expect(summary.totalGross).toBe(3660); // 1220 + 2440
    expect(summary.totalNet).toBe(3000); // 1000 + 2000
  });

  it("excludes invoices of non-WON leads and out-of-period invoices", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });
    const lost = store.addLead({ organizationId: ORG_A, stage: LeadStage.LOST, createdAt: jun(2) });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: lost.id,
      grossAmount: "999.00",
      netAmount: "900.00",
      issuedAt: jun(5),
    });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "100.00",
      netAmount: "90.00",
      issuedAt: may(5),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const summary = await getInvoiceSummary(deps, { year: "2026", month: "6" });

    expect(summary.count).toBe(0);
    expect(summary.totalGross).toBe(0);
    expect(summary.totalNet).toBe(0);
  });

  it("returns zeros when there are no invoices (empty period)", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const summary = await getInvoiceSummary(deps, { year: "2026" });

    expect(summary).toEqual({ count: 0, totalGross: 0, totalNet: 0 });
  });

  it("does NOT aggregate another tenant's invoices (cross-tenant isolation)", async () => {
    const store = new DashboardStore();
    const wonB = store.addLead({ organizationId: ORG_B, stage: LeadStage.WON, createdAt: jun(1) });
    store.addInvoice({
      organizationId: ORG_B,
      leadId: wonB.id,
      grossAmount: "5000.00",
      netAmount: "4500.00",
      issuedAt: jun(2),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const summary = await getInvoiceSummary(deps, { year: "2026" });

    expect(summary).toEqual({ count: 0, totalGross: 0, totalNet: 0 });
  });

  it("rejects an invalid period", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    await expect(getInvoiceSummary(deps, { month: "6" })).resolves.toBeDefined(); // year absent → all time, valid
    await expect(getInvoiceSummary(deps, { year: "2026", month: "99" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

function jun(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}
function may(day: number): Date {
  return new Date(Date.UTC(2026, 4, day));
}
