import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { getActiveLeads } from "@/server/dashboard/get-active-leads";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

const NOW = () => new Date("2026-06-18T12:00:00.000Z");

describe("getActiveLeads", () => {
  it("returns non-terminal leads ordered by days-in-stage DESC (most stuck first)", async () => {
    const store = new DashboardStore();
    store.addLead({
      organizationId: ORG_A,
      firstName: "Recent",
      stage: LeadStage.TO_HANDLE,
      stageChangedAt: new Date("2026-06-17T00:00:00.000Z"), // ~1 day
    });
    store.addLead({
      organizationId: ORG_A,
      firstName: "Stuck",
      stage: LeadStage.WAITING_DOCS,
      stageChangedAt: new Date("2026-05-01T00:00:00.000Z"), // ~48 days
    });

    const deps = buildFakeDashboardDeps(store, ORG_A, NOW);
    const { data } = await getActiveLeads(deps);

    expect(data).toHaveLength(2);
    expect(data[0]?.firstName).toBe("Stuck"); // most days first
    expect(data[1]?.firstName).toBe("Recent");
    expect(data[0]!.daysInStage).toBeGreaterThan(data[1]!.daysInStage);
  });

  it("excludes terminal stages (WON / LOST)", async () => {
    const store = new DashboardStore();
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.LOST });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });

    const deps = buildFakeDashboardDeps(store, ORG_A, NOW);
    const { data } = await getActiveLeads(deps);

    expect(data).toHaveLength(1);
    expect(data[0]?.stage).toBe(LeadStage.TAKEN);
  });

  it("excludes soft-deleted leads", async () => {
    const store = new DashboardStore();
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TAKEN,
      deletedAt: new Date("2026-06-10T00:00:00.000Z"),
    });

    const deps = buildFakeDashboardDeps(store, ORG_A, NOW);
    const { data } = await getActiveLeads(deps);

    expect(data).toHaveLength(1);
  });

  it("caps the result at the requested limit", async () => {
    const store = new DashboardStore();
    for (let i = 0; i < 10; i += 1) {
      store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    }
    const deps = buildFakeDashboardDeps(store, ORG_A, NOW);

    const { data } = await getActiveLeads(deps, { limit: 3 });
    expect(data).toHaveLength(3);

    const def = await getActiveLeads(deps); // default limit = 5
    expect(def.data).toHaveLength(5);
  });

  it("does NOT see another tenant's leads (cross-tenant isolation)", async () => {
    const store = new DashboardStore();
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TAKEN });

    const deps = buildFakeDashboardDeps(store, ORG_A, NOW);
    const { data } = await getActiveLeads(deps);

    expect(data).toEqual([]);
  });

  it("rejects an invalid limit (over the max)", async () => {
    const store = new DashboardStore();
    const deps = buildFakeDashboardDeps(store, ORG_A, NOW);

    await expect(getActiveLeads(deps, { limit: 999 })).rejects.toBeInstanceOf(ValidationError);
  });
});
