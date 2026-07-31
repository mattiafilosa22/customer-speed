import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { getDashboardKpis } from "@/server/dashboard/get-kpis";
import { getSourceBreakdown } from "@/server/dashboard/get-source-breakdown";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("getSourceBreakdown", () => {
  it("groups the period's leads by source with won/lost/conversion, highest volume first", async () => {
    const store = new DashboardStore();
    const instagram = store.addLeadSource({ organizationId: ORG_A, label: "Instagram" });
    const referral = store.addLeadSource({ organizationId: ORG_A, label: "Referenza" });
    // Instagram: 3 leads, 1 won, 1 lost.
    store.addLead({ organizationId: ORG_A, sourceId: instagram.id, stage: LeadStage.WON, createdAt: jun(1) });
    store.addLead({ organizationId: ORG_A, sourceId: instagram.id, stage: LeadStage.LOST, createdAt: jun(2) });
    store.addLead({ organizationId: ORG_A, sourceId: instagram.id, stage: LeadStage.TAKEN, createdAt: jun(3) });
    // Referenza: 1 lead, won.
    store.addLead({ organizationId: ORG_A, sourceId: referral.id, stage: LeadStage.WON, createdAt: jun(4) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items, total } = await getSourceBreakdown(deps, { year: "2026" });

    expect(total).toBe(4);
    expect(items).toEqual([
      {
        sourceId: instagram.id,
        label: "Instagram",
        total: 3,
        won: 1,
        lost: 1,
        convRate: 1 / 3,
      },
      { sourceId: referral.id, label: "Referenza", total: 1, won: 1, lost: 0, convRate: 1 },
    ]);
  });

  it("buckets leads with no source under sourceId null (never dropped)", async () => {
    const store = new DashboardStore();
    const src = store.addLeadSource({ organizationId: ORG_A, label: "Funnel" });
    store.addLead({ organizationId: ORG_A, sourceId: src.id, stage: LeadStage.WON, createdAt: jun(1) });
    store.addLead({ organizationId: ORG_A, sourceId: null, stage: LeadStage.TAKEN, createdAt: jun(2) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items, total } = await getSourceBreakdown(deps, { year: "2026" });

    expect(total).toBe(2);
    expect(items.find((i) => i.sourceId === null)).toEqual({
      sourceId: null,
      label: null,
      total: 1,
      won: 0,
      lost: 0,
      convRate: 0,
    });
  });

  it("reconciles with the KPI totals for the same period (same anchor and definitions)", async () => {
    const store = new DashboardStore();
    const a = store.addLeadSource({ organizationId: ORG_A, label: "A" });
    const b = store.addLeadSource({ organizationId: ORG_A, label: "B" });
    store.addLead({ organizationId: ORG_A, sourceId: a.id, stage: LeadStage.WON, createdAt: jun(1) });
    store.addLead({ organizationId: ORG_A, sourceId: a.id, stage: LeadStage.LOST, createdAt: jun(2) });
    store.addLead({ organizationId: ORG_A, sourceId: b.id, stage: LeadStage.WON, createdAt: jun(3) });
    store.addLead({ organizationId: ORG_A, sourceId: null, stage: LeadStage.TO_HANDLE, createdAt: jun(4) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const [kpis, breakdown] = await Promise.all([
      getDashboardKpis(deps, { year: "2026" }),
      getSourceBreakdown(deps, { year: "2026" }),
    ]);

    const sum = (pick: (item: (typeof breakdown.items)[number]) => number): number =>
      breakdown.items.reduce((acc, item) => acc + pick(item), 0);

    expect(breakdown.total).toBe(kpis.totals);
    expect(sum((i) => i.won)).toBe(kpis.won);
    expect(sum((i) => i.lost)).toBe(kpis.lost);
  });

  it("excludes leads created outside the period", async () => {
    const store = new DashboardStore();
    const src = store.addLeadSource({ organizationId: ORG_A, label: "Funnel" });
    store.addLead({
      organizationId: ORG_A,
      sourceId: src.id,
      stage: LeadStage.WON,
      createdAt: jun(10),
    });
    store.addLead({
      organizationId: ORG_A,
      sourceId: src.id,
      stage: LeadStage.WON,
      createdAt: new Date(Date.UTC(2025, 5, 10)),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items, total } = await getSourceBreakdown(deps, { year: "2026" });

    expect(total).toBe(1);
    expect(items[0]?.total).toBe(1);
  });

  it("returns empty when there are no leads in the period", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    expect(await getSourceBreakdown(deps, { year: "2026" })).toEqual({ items: [], total: 0 });
  });

  it("does NOT see another tenant's leads or sources (cross-tenant isolation)", async () => {
    const store = new DashboardStore();
    const srcB = store.addLeadSource({ organizationId: ORG_B, label: "B source" });
    store.addLead({
      organizationId: ORG_B,
      sourceId: srcB.id,
      stage: LeadStage.WON,
      createdAt: jun(1),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items, total } = await getSourceBreakdown(deps, { year: "2026" });

    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  it("rejects an invalid period", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    await expect(getSourceBreakdown(deps, { year: "1999" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

function jun(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}
