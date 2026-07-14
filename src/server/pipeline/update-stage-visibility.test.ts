import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import {
  PIPELINE_CONFIG_ERRORS,
  updateStageVisibility,
} from "@/server/pipeline/update-stage-visibility";
import { buildFakePipelineDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("updateStageVisibility", () => {
  it("hides an empty, non-terminal stage (happy path) + audits", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps, audits } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const result = await updateStageVisibility(deps, {
      stage: LeadStage.CALL_SCHEDULED,
      isVisible: false,
    });

    expect(result).toEqual({ stage: LeadStage.CALL_SCHEDULED, isVisible: false });
    expect(store.stageConfig(ORG_A, LeadStage.CALL_SCHEDULED).isVisible).toBe(false);
    expect(audits.some((a) => a.action === "pipeline.stage.visibility")).toBe(true);
  });

  it("can always SHOW a stage, even a terminal one or one with leads", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.stageConfig(ORG_A, LeadStage.WON).isVisible = false;
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await updateStageVisibility(deps, { stage: LeadStage.WON, isVisible: true });

    expect(store.stageConfig(ORG_A, LeadStage.WON).isVisible).toBe(true);
  });

  it("refuses to hide a TERMINAL stage (WON/LOST back the KPIs) → ConflictError", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(
      updateStageVisibility(deps, { stage: LeadStage.LOST, isVisible: false }),
    ).rejects.toMatchObject({ message: PIPELINE_CONFIG_ERRORS.TERMINAL_HIDE });
    expect(store.stageConfig(ORG_A, LeadStage.LOST).isVisible).toBe(true);
  });

  it("refuses to hide a stage that still holds ACTIVE leads → ConflictError", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(
      updateStageVisibility(deps, { stage: LeadStage.TAKEN, isVisible: false }),
    ).rejects.toMatchObject({ message: PIPELINE_CONFIG_ERRORS.HIDE_WITH_LEADS });
    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).isVisible).toBe(true);
  });

  it("counts only OWN-tenant leads when guarding (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    // A lead in stage TAKEN belongs to ANOTHER tenant → must not block ORG_A.
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TAKEN });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await updateStageVisibility(deps, { stage: LeadStage.TAKEN, isVisible: false });

    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).isVisible).toBe(false);
  });

  it("self-heals a missing config row (pre-existing tenant, docs/03 §3.3) without touching another tenant's row", async () => {
    const store = new LeadStore();
    // ORG_A has NO config rows at all (simulates a tenant seeded before this
    // stage existed); ORG_B has its own, distinct, seeded row for the SAME
    // stage. Hiding it for ORG_A must CREATE ORG_A's own row and must NEVER
    // read/touch ORG_B's.
    store.seedStageConfigs(ORG_B);
    const { deps, audits } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const result = await updateStageVisibility(deps, { stage: LeadStage.TAKEN, isVisible: false });

    expect(result).toEqual({ stage: LeadStage.TAKEN, isVisible: false });
    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).isVisible).toBe(false);
    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).organizationId).toBe(ORG_A);
    // ORG_B's own row is untouched.
    expect(store.stageConfig(ORG_B, LeadStage.TAKEN).isVisible).toBe(true);
    expect(audits.some((a) => a.action === "pipeline.stage.visibility")).toBe(true);
  });

  it("rejects invalid input (non-enum stage)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(
      updateStageVisibility(deps, { stage: "NOPE", isVisible: false }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
