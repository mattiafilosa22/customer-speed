import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import {
  dashboardFilterSchema,
  leadSourceFilter,
  UNSPECIFIED_SOURCE,
} from "@/server/dashboard/filters";
import { getActiveLeads } from "@/server/dashboard/get-active-leads";
import { getDashboardKpis } from "@/server/dashboard/get-kpis";
import { getInvoiceSummary } from "@/server/dashboard/get-invoice-summary";
import { getLostBreakdown } from "@/server/dashboard/get-lost-breakdown";
import { getPipelineDistribution } from "@/server/dashboard/get-pipeline-distribution";
import { getSourceBreakdown } from "@/server/dashboard/get-source-breakdown";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

/**
 * The "provenienza" (lead source) filter — the dashboard's second filter
 * dimension (docs/02 §2.2). Two things are asserted here:
 *  - the pure `leadSourceFilter` mapping (including the `UNSPECIFIED_SOURCE`
 *    sentinel → `sourceId: null`), and
 *  - that EVERY widget honours it, including the invoice-anchored ones (whose
 *    source lives on the related lead) and the source breakdown itself.
 */

const ORG_A = "org_a";
const ORG_B = "org_b";
const YEAR = { year: "2026" };

describe("leadSourceFilter", () => {
  it("adds no clause when no source is selected", () => {
    expect(leadSourceFilter({})).toEqual({});
    expect(leadSourceFilter({ sourceId: undefined })).toEqual({});
  });

  it("filters by the selected source id", () => {
    expect(leadSourceFilter({ sourceId: "src_1" })).toEqual({ sourceId: "src_1" });
  });

  it("maps the 'unspecified' sentinel onto the null-source bucket", () => {
    expect(leadSourceFilter({ sourceId: UNSPECIFIED_SOURCE })).toEqual({ sourceId: null });
  });
});

describe("dashboardFilterSchema", () => {
  it("accepts a period with no source (source is optional)", () => {
    expect(dashboardFilterSchema.parse({ year: 2026 })).toEqual({ year: 2026 });
  });

  it("rejects an empty sourceId instead of treating it as a wildcard", () => {
    expect(dashboardFilterSchema.safeParse({ sourceId: "" }).success).toBe(false);
  });
});

describe("source filter across the dashboard widgets", () => {
  /**
   * One tenant, two sources + one lead with no source at all. Instagram: 2 leads
   * (1 WON with a 1000/800 invoice, 1 LOST). Referenza: 1 WON lead with a
   * 500/400 invoice. No source: 1 TAKEN lead.
   */
  function seed() {
    const store = new DashboardStore();
    store.seedStageConfigs(ORG_A);
    const instagram = store.addLeadSource({ organizationId: ORG_A, label: "Instagram" });
    const referral = store.addLeadSource({ organizationId: ORG_A, label: "Referenza" });
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Prezzo" });

    const igWon = store.addLead({
      organizationId: ORG_A,
      sourceId: instagram.id,
      stage: LeadStage.WON,
      createdAt: jun(1),
    });
    store.addLead({
      organizationId: ORG_A,
      sourceId: instagram.id,
      stage: LeadStage.LOST,
      lossReasonId: reason.id,
      createdAt: jun(2),
    });
    const refWon = store.addLead({
      organizationId: ORG_A,
      sourceId: referral.id,
      stage: LeadStage.WON,
      createdAt: jun(3),
    });
    const noSource = store.addLead({
      organizationId: ORG_A,
      sourceId: null,
      stage: LeadStage.TAKEN,
      createdAt: jun(4),
      stageChangedAt: jun(4),
    });

    store.addInvoice({
      organizationId: ORG_A,
      leadId: igWon.id,
      grossAmount: "1000.00",
      netAmount: "800.00",
      issuedAt: jun(5),
    });
    store.addInvoice({
      organizationId: ORG_A,
      leadId: refWon.id,
      grossAmount: "500.00",
      netAmount: "400.00",
      issuedAt: jun(6),
    });

    return { store, instagram, referral, noSource };
  }

  it("narrows the KPI lead counts AND the net revenue to the selected source", async () => {
    const { store, instagram } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const all = await getDashboardKpis(deps, YEAR);
    const filtered = await getDashboardKpis(deps, { ...YEAR, sourceId: instagram.id });

    expect(all).toMatchObject({ totals: 4, won: 2, lost: 1, netRevenue: 1200 });
    // Instagram alone: 2 leads (1 won, 1 lost) and only its own invoice.
    expect(filtered).toMatchObject({ totals: 2, won: 1, lost: 1, netRevenue: 800 });
    expect(filtered.convRate).toBe(0.5);
  });

  it("narrows the pipeline distribution to the selected source", async () => {
    const { store, instagram } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const { stages } = await getPipelineDistribution(deps, { ...YEAR, sourceId: instagram.id });
    const countOf = (stage: LeadStage): number =>
      stages.find((item) => item.stage === stage)?.count ?? 0;

    expect(countOf(LeadStage.WON)).toBe(1);
    expect(countOf(LeadStage.LOST)).toBe(1);
    // The no-source lead sits in TAKEN and must disappear under the filter.
    expect(countOf(LeadStage.TAKEN)).toBe(0);
  });

  it("narrows the invoice summary through the lead relation", async () => {
    const { store, referral } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const all = await getInvoiceSummary(deps, YEAR);
    const filtered = await getInvoiceSummary(deps, { ...YEAR, sourceId: referral.id });

    expect(all).toEqual({ count: 2, totalGross: 1500, totalNet: 1200 });
    expect(filtered).toEqual({ count: 1, totalGross: 500, totalNet: 400 });
  });

  it("keeps the invoice summary net total equal to the KPI net revenue under the same filter", async () => {
    const { store, instagram } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);
    const filter = { ...YEAR, sourceId: instagram.id };

    const [kpis, summary] = await Promise.all([
      getDashboardKpis(deps, filter),
      getInvoiceSummary(deps, filter),
    ]);

    expect(summary.totalNet).toBe(kpis.netRevenue);
  });

  it("narrows the lost breakdown to the selected source", async () => {
    const { store, referral, instagram } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const fromInstagram = await getLostBreakdown(deps, { ...YEAR, sourceId: instagram.id });
    const fromReferral = await getLostBreakdown(deps, { ...YEAR, sourceId: referral.id });

    expect(fromInstagram.items).toEqual([
      { reasonId: expect.any(String), label: "Prezzo", isCustom: false, count: 1 },
    ]);
    // Referenza has no LOST lead at all.
    expect(fromReferral.items).toEqual([]);
  });

  it("collapses the source breakdown to the selected row (still reconciling with the KPIs)", async () => {
    const { store, instagram } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);
    const filter = { ...YEAR, sourceId: instagram.id };

    const [breakdown, kpis] = await Promise.all([
      getSourceBreakdown(deps, filter),
      getDashboardKpis(deps, filter),
    ]);

    expect(breakdown.items).toEqual([
      { sourceId: instagram.id, label: "Instagram", total: 2, won: 1, lost: 1, convRate: 0.5 },
    ]);
    expect(breakdown.total).toBe(kpis.totals);
  });

  it("narrows the active-leads list to the selected source", async () => {
    const { store, instagram, noSource } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const unfiltered = await getActiveLeads(deps, {});
    const filtered = await getActiveLeads(deps, { sourceId: instagram.id });

    // WON/LOST are terminal, so only the no-source TAKEN lead is active.
    expect(unfiltered.data.map((lead) => lead.id)).toEqual([noSource.id]);
    expect(filtered.data).toEqual([]);
  });

  it("selects the leads with NO source via the 'unspecified' sentinel", async () => {
    const { store, noSource } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);
    const filter = { ...YEAR, sourceId: UNSPECIFIED_SOURCE };

    const kpis = await getDashboardKpis(deps, filter);
    const breakdown = await getSourceBreakdown(deps, filter);
    const active = await getActiveLeads(deps, { sourceId: UNSPECIFIED_SOURCE });

    expect(kpis).toMatchObject({ totals: 1, won: 0, lost: 0, netRevenue: 0 });
    expect(breakdown.items).toEqual([
      { sourceId: null, label: null, total: 1, won: 0, lost: 0, convRate: 0 },
    ]);
    expect(active.data.map((lead) => lead.id)).toEqual([noSource.id]);
  });

  it("returns nothing for a source id belonging to ANOTHER tenant (no cross-tenant leak)", async () => {
    const { store } = seed();
    const srcB = store.addLeadSource({ organizationId: ORG_B, label: "B source" });
    store.addLead({
      organizationId: ORG_B,
      sourceId: srcB.id,
      stage: LeadStage.WON,
      createdAt: jun(1),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const kpis = await getDashboardKpis(deps, { ...YEAR, sourceId: srcB.id });
    const breakdown = await getSourceBreakdown(deps, { ...YEAR, sourceId: srcB.id });

    expect(kpis).toMatchObject({ totals: 0, won: 0, lost: 0, netRevenue: 0 });
    expect(breakdown).toEqual({ items: [], total: 0 });
  });

  it("rejects an empty sourceId at the use-case boundary", async () => {
    const { store } = seed();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    await expect(getDashboardKpis(deps, { ...YEAR, sourceId: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

function jun(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}
