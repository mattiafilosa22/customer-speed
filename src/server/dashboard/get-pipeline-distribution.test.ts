import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { getPipelineDistribution } from "@/server/dashboard/get-pipeline-distribution";
import { buildFakeDashboardDeps, DashboardStore } from "@/server/dashboard/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("getPipelineDistribution", () => {
  it("returns one entry per VISIBLE stage in order, with DB-side counts", async () => {
    const store = new DashboardStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: jun(1) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: jun(2) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN, createdAt: jun(3) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { stages } = await getPipelineDistribution(deps, { year: "2026" });

    expect(stages).toHaveLength(9);
    expect(stages[0]?.stage).toBe(LeadStage.TO_HANDLE); // sorted by sortOrder
    expect(stages.find((s) => s.stage === LeadStage.TO_HANDLE)?.count).toBe(2);
    expect(stages.find((s) => s.stage === LeadStage.TAKEN)?.count).toBe(1);
    expect(stages.find((s) => s.stage === LeadStage.WON)?.count).toBe(0); // empty stage still shown
  });

  it("excludes hidden stages", async () => {
    const store = new DashboardStore();
    store.seedStageConfigs(ORG_A);
    const hidden = store.stageConfigs.find(
      (c) => c.organizationId === ORG_A && c.stage === LeadStage.CALL_SCHEDULED,
    );
    if (hidden) hidden.isVisible = false;

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { stages } = await getPipelineDistribution(deps, { year: "2026" });

    expect(stages).toHaveLength(8);
    expect(stages.map((s) => s.stage)).not.toContain(LeadStage.CALL_SCHEDULED);
  });

  it("filters by period (createdAt)", async () => {
    const store = new DashboardStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: jun(15) });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, createdAt: may(15) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const june = await getPipelineDistribution(deps, { year: "2026", month: "6" });

    expect(june.stages.find((s) => s.stage === LeadStage.TO_HANDLE)?.count).toBe(1);
  });

  it("does NOT count another tenant's leads (cross-tenant isolation)", async () => {
    const store = new DashboardStore();
    store.seedStageConfigs(ORG_A);
    store.seedStageConfigs(ORG_B);
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TO_HANDLE, createdAt: jun(1) });

    const deps = buildFakeDashboardDeps(store, ORG_A);
    const { stages } = await getPipelineDistribution(deps, { year: "2026" });

    expect(stages.find((s) => s.stage === LeadStage.TO_HANDLE)?.count).toBe(0);
  });

  it("rejects an invalid period", async () => {
    const store = new DashboardStore();
    store.seedStageConfigs(ORG_A);
    const deps = buildFakeDashboardDeps(store, ORG_A);

    await expect(
      getPipelineDistribution(deps, { year: "2026", month: "0" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

function jun(day: number): Date {
  return new Date(Date.UTC(2026, 5, day));
}
function may(day: number): Date {
  return new Date(Date.UTC(2026, 4, day));
}
