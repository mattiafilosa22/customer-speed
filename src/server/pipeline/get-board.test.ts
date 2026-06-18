import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { getBoard } from "@/server/pipeline/get-board";
import { buildFakePipelineDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("getBoard", () => {
  it("builds one column per VISIBLE stage in config order, with DB-side counts", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    // Hide CALL_SCHEDULED so it must not appear as a column.
    store.stageConfig(ORG_A, LeadStage.CALL_SCHEDULED).isVisible = false;
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, {});

    expect(columns).toHaveLength(8); // 9 - 1 hidden
    expect(columns.map((c) => c.stage)).not.toContain(LeadStage.CALL_SCHEDULED);
    expect(columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(2);
    expect(columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.cards).toHaveLength(2);
    expect(columns.find((c) => c.stage === LeadStage.TAKEN)?.count).toBe(1);
  });

  it("places cards in the correct column and computes daysInStage", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.WAITING_DOCS,
      firstName: "Anna",
      stageChangedAt: new Date("2026-06-10T00:00:00.000Z"),
    });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, {});

    const col = columns.find((c) => c.stage === LeadStage.WAITING_DOCS);
    expect(col?.cards[0]?.firstName).toBe("Anna");
    expect(col?.cards[0]?.daysInStage).toBeGreaterThanOrEqual(0);
  });

  it("does NOT include leads from another tenant (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.seedStageConfigs(ORG_B);
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TO_HANDLE });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, {});

    expect(columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(0);
  });

  it("filters by period (year/month) on createdAt, consistent with the list", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      createdAt: new Date("2026-03-15T00:00:00.000Z"),
    });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      createdAt: new Date("2025-12-31T00:00:00.000Z"),
    });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const all = await getBoard(deps, { year: "2026" });
    expect(all.columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(1);

    const march = await getBoard(deps, { year: "2026", month: "3" });
    expect(march.columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(1);

    const april = await getBoard(deps, { year: "2026", month: "4" });
    expect(april.columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(0);
  });

  it("rejects an invalid period (out-of-range month)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(getBoard(deps, { year: "2026", month: "13" })).rejects.toThrow();
  });
});
