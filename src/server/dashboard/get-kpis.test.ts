import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { getDashboardKpis } from "@/server/dashboard/get-kpis";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

/**
 * KPI use case. Verifies the documented "del periodo" semantics, the conversion
 * rate formula (incl. divide-by-zero → 0), the net-revenue Decimal sum (WON +
 * issuedAt in period), cross-tenant isolation and input validation.
 */
describe("getDashboardKpis", () => {
  it("counts leads by createdAt in period; won/lost by current stage", async () => {
    const store = new DashboardStore();
    // 4 leads created in June 2026: 1 WON, 1 LOST, 2 active.
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(5) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.LOST, createdAt: jun(6) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: jun(7) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN, createdAt: jun(8) });
    // 1 lead created in May (out of June period).
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: may(20) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, { year: "2026", month: "6" });

    expect(kpis.totals).toBe(4);
    expect(kpis.won).toBe(1);
    expect(kpis.lost).toBe(1);
  });

  it("computes conv. rate = won / totals (verified numerically)", async () => {
    const store = new DashboardStore();
    // 2 WON out of 5 created in the year → 0.4.
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(2) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.LOST, createdAt: jun(3) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: jun(4) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN, createdAt: jun(5) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, { year: "2026" });

    expect(kpis.totals).toBe(5);
    expect(kpis.won).toBe(2);
    expect(kpis.convRate).toBeCloseTo(0.4, 10);
  });

  it("returns conv. rate 0 (not NaN) when there are 0 leads in the period", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const kpis = await getDashboardKpis(deps, { year: "2026" });

    expect(kpis.totals).toBe(0);
    expect(kpis.won).toBe(0);
    expect(kpis.convRate).toBe(0);
    expect(Number.isNaN(kpis.convRate)).toBe(false);
  });

  it("sums Invoice.netAmount of WON leads issued in the period (verified numerically)", async () => {
    const store = new DashboardStore();
    const won = store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });
    const lost = store.addLead({ organizationId: ORG_A, stage: LeadStage.LOST, createdAt: jun(2) });

    // Two invoices on the WON lead, issued in June → counted: 1000.50 + 2499.50.
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "1220.61",
      netAmount: "1000.50",
      issuedAt: jun(10),
    });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "3049.39",
      netAmount: "2499.50",
      issuedAt: jun(15),
    });
    // Invoice on a LOST lead → excluded (not WON).
    store.addInvoice({
      organizationId: ORG_A,
      leadId: lost.id,
      grossAmount: "999.99",
      netAmount: "800.00",
      issuedAt: jun(11),
    });
    // Invoice on the WON lead but issued in May → excluded (out of period).
    store.addInvoice({
      organizationId: ORG_A,
      leadId: won.id,
      grossAmount: "500.00",
      netAmount: "400.00",
      issuedAt: may(1),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, { year: "2026", month: "6" });

    // 1000.50 + 2499.50 = 3500.00 exactly (Decimal sum, no float drift).
    expect(kpis.netRevenue).toBe(3500);
  });

  it("net revenue is 0 when there are no invoices", async () => {
    const store = new DashboardStore();
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const kpis = await getDashboardKpis(deps, { year: "2026" });

    expect(kpis.netRevenue).toBe(0);
  });

  it("does NOT see another tenant's leads or invoices (cross-tenant isolation)", async () => {
    const store = new DashboardStore();
    const wonB = store.addLead({ organizationId: ORG_B, stage: LeadStage.WON, createdAt: jun(1) });
    store.addInvoice({
      organizationId: ORG_B,
      leadId: wonB.id,
      grossAmount: "9999.00",
      netAmount: "9000.00",
      issuedAt: jun(2),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, { year: "2026" });

    expect(kpis.totals).toBe(0);
    expect(kpis.won).toBe(0);
    expect(kpis.netRevenue).toBe(0);
  });

  it("excludes soft-deleted leads from the counts", async () => {
    const store = new DashboardStore();
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.WON,
      createdAt: jun(2),
      deletedAt: jun(3),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, { year: "2026" });

    expect(kpis.totals).toBe(1);
    expect(kpis.won).toBe(1);
  });

  it("with no year bound, aggregates across all time", async () => {
    const store = new DashboardStore();
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: may(1) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(1) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, {});

    expect(kpis.totals).toBe(2);
    expect(kpis.won).toBe(2);
    expect(kpis.convRate).toBe(1);
  });

  it("rejects an invalid period (out-of-range month)", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    await expect(getDashboardKpis(deps, { year: "2026", month: "13" })).rejects.toBeInstanceOf(
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
