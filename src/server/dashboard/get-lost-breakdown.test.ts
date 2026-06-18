import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { getLostBreakdown } from "@/server/dashboard/get-lost-breakdown";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("getLostBreakdown", () => {
  it("groups LOST leads by reason with counts, most frequent first", async () => {
    const store = new DashboardStore();
    const r1 = store.addLossReason({ organizationId: ORG_A, label: "Non ha più risposto" });
    const r2 = store.addLossReason({ organizationId: ORG_A, label: "Budget insufficiente" });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.LOST,
      lossReasonId: r1.id,
      createdAt: jun(1),
    });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.LOST,
      lossReasonId: r1.id,
      createdAt: jun(2),
    });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.LOST,
      lossReasonId: r2.id,
      createdAt: jun(3),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items } = await getLostBreakdown(deps, { year: "2026" });

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ reasonId: r1.id, label: "Non ha più risposto", count: 2 });
    expect(items[1]).toEqual({ reasonId: r2.id, label: "Budget insufficiente", count: 1 });
  });

  it("buckets LOST leads with no reason as reasonId null / label null", async () => {
    const store = new DashboardStore();
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.LOST,
      lossReasonId: null,
      createdAt: jun(1),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items } = await getLostBreakdown(deps, { year: "2026" });

    expect(items).toEqual([{ reasonId: null, label: null, count: 1 }]);
  });

  it("only includes LOST leads (ignores WON / active)", async () => {
    const store = new DashboardStore();
    const r1 = store.addLossReason({ organizationId: ORG_A, label: "X" });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.LOST,
      lossReasonId: r1.id,
      createdAt: jun(1),
    });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON, createdAt: jun(2) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: jun(3) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items } = await getLostBreakdown(deps, { year: "2026" });

    expect(items).toEqual([{ reasonId: r1.id, label: "X", count: 1 }]);
  });

  it("returns empty when there are no lost leads in the period", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    const { items } = await getLostBreakdown(deps, { year: "2026" });

    expect(items).toEqual([]);
  });

  it("does NOT see another tenant's lost leads (cross-tenant isolation)", async () => {
    const store = new DashboardStore();
    const rB = store.addLossReason({ organizationId: ORG_B, label: "B reason" });
    store.addLead({
      organizationId: ORG_B,
      stage: LeadStage.LOST,
      lossReasonId: rB.id,
      createdAt: jun(1),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { items } = await getLostBreakdown(deps, { year: "2026" });

    expect(items).toEqual([]);
  });

  it("rejects an invalid period", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A);

    await expect(getLostBreakdown(deps, { year: "1999" })).rejects.toBeInstanceOf(ValidationError);
  });
});

function jun(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}
