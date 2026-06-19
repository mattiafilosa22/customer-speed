import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { getPipelineConfig } from "@/server/pipeline/get-pipeline-config";
import { buildFakePipelineDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("getPipelineConfig", () => {
  it("returns all stages ordered by sortOrder with terminal flags and lead counts", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.WON });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { stages } = await getPipelineConfig(deps);

    expect(stages).toHaveLength(9);
    expect(stages.map((s) => s.stage)).toEqual([
      LeadStage.TO_HANDLE,
      LeadStage.TAKEN,
      LeadStage.CALL_SCHEDULED,
      LeadStage.WAITING_DOCS,
      LeadStage.PRESENTATION_CALL,
      LeadStage.WAITING_DECISION,
      LeadStage.WAITING_PAYMENT,
      LeadStage.WON,
      LeadStage.LOST,
    ]);
    const toHandle = stages.find((s) => s.stage === LeadStage.TO_HANDLE);
    expect(toHandle?.leadCount).toBe(2);
    expect(stages.find((s) => s.stage === LeadStage.WON)?.isTerminal).toBe(true);
    expect(stages.find((s) => s.stage === LeadStage.LOST)?.isTerminal).toBe(true);
    expect(stages.find((s) => s.stage === LeadStage.TAKEN)?.isTerminal).toBe(false);
  });

  it("reflects a custom sortOrder and colorToken", async () => {
    const store = new LeadStore();
    // TAKEN ordered before TO_HANDLE, with a colour override.
    store.addStageConfig({ organizationId: ORG_A, stage: LeadStage.TAKEN, sortOrder: 0, colorToken: "--stage-won" });
    store.addStageConfig({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, sortOrder: 1 });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { stages } = await getPipelineConfig(deps);

    expect(stages[0]?.stage).toBe(LeadStage.TAKEN);
    expect(stages[0]?.colorToken).toBe("--stage-won");
  });

  it("does NOT count leads from another tenant (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.seedStageConfigs(ORG_B);
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TO_HANDLE });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { stages } = await getPipelineConfig(deps);

    expect(stages.find((s) => s.stage === LeadStage.TO_HANDLE)?.leadCount).toBe(0);
  });

  it("does NOT count soft-deleted leads", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN, deletedAt: new Date() });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { stages } = await getPipelineConfig(deps);

    expect(stages.find((s) => s.stage === LeadStage.TAKEN)?.leadCount).toBe(1);
  });
});
